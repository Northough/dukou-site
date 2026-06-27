import { useEffect, useMemo, useState } from "react";
import { saveMessage } from "../api/messageArchive.js";
import {
  addDaysToDateString,
  getTodayDateString,
  loadReminders,
  loadSchedule,
  saveReminders,
  saveSchedule,
} from "../store/functionLocalStore.js";
import "../styles/function.css";

const REMINDER_ROLE_META = [
  { id: "nortia", chatSpaceId: "main", name: "Nortia", avatar: "N", color: "blue" },
  { id: "cenxu", chatSpaceId: "cenxu", name: "岑序", avatar: "岑", color: "slate" },
  { id: "dukou", chatSpaceId: "dukou", name: "渡口", avatar: "渡", color: "orange" },
];

const REMINDER_ROLE_BY_ID = Object.fromEntries(REMINDER_ROLE_META.map((role) => [role.id, role]));

// Reminders are owned by the AI role that promised to remind 17.
// Status feedback is written back into that role's chat window.
const reminderStatusLabels = {
  pending: "待处理",
  done: "已完成",
  snoozed: "已取消",
  expired: "过期",
};

// Schedule is 17's global personal data, not owned by any AI role.
const scheduleStatusLabels = {
  pending: "待完成",
  done: "已完成",
  expired: "过期",
};

const defaultReminderItems = [
  {
    id: "du-reminder-water",
    title: "把水杯放到手边",
    body: "15:30 前把水杯放到手边。",
    dueAt: `${getTodayDateString()}T15:30:00`,
    status: "pending",
    ownerRole: "nortia",
  },
  {
    id: "du-reminder-1",
    title: "下班路过生煎店",
    body: "下班路过生煎店时记得看看。",
    dueAt: `${getTodayDateString()}T16:30:00`,
    status: "pending",
    ownerRole: "nortia",
  },
  {
    id: "user-reminder-1",
    title: "预约牙医检查",
    body: "预约牙医检查。",
    dueAt: `${addDaysToDateString(getTodayDateString(), -2)}T10:00:00`,
    status: "expired",
    ownerRole: "cenxu",
  },
  {
    id: "user-reminder-2",
    title: "整理上周的摄影作品",
    body: "整理上周的摄影作品。",
    dueAt: `${getTodayDateString()}T20:00:00`,
    status: "pending",
    ownerRole: "cenxu",
  },
  {
    id: "user-reminder-3",
    title: "读完《向晚》最后三十页",
    body: "读完《向晚》最后三十页。",
    dueAt: `${addDaysToDateString(getTodayDateString(), 1)}T22:30:00`,
    status: "pending",
    ownerRole: "dukou",
  },
];

const defaultScheduleItems = [
  {
    id: "schedule-a",
    date: getTodayDateString(),
    title: "写周报摘要",
    startsAt: "14:00",
    endsAt: "14:40",
    status: "pending",
    type: "todo",
    note: "先写要点，再补细节。",
    subtasks: [
      { id: "schedule-a-1", title: "列出三件完成事项", done: true },
      { id: "schedule-a-2", title: "补风险和下周计划", done: false },
    ],
  },
  {
    id: "schedule-b",
    date: getTodayDateString(),
    title: "给植物浇水",
    startsAt: "18:30",
    endsAt: "18:40",
    status: "pending",
    type: "todo",
    note: "阳台和书桌旁都看一下。",
    subtasks: [],
  },
  {
    id: "schedule-c",
    date: addDaysToDateString(getTodayDateString(), 1),
    title: "备份照片",
    startsAt: "21:00",
    endsAt: "21:30",
    status: "done",
    type: "todo",
    note: "移动硬盘和云端各一份。",
    subtasks: [{ id: "schedule-c-1", title: "检查最近一周", done: true }],
  },
];

const scheduleDayOffsets = [0, 1, 2, 3, 4];

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14 8 3 3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14" />
      <path d="M9 7V5h6v2" />
      <path d="m10 11 .5 6M14 11l-.5 6" />
      <path d="M7 7l1 13h8l1-13" />
    </svg>
  );
}

function HistoryReminderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8v5l3 2" />
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 5.5v4h4" />
    </svg>
  );
}

function EmptyBlock({ title, body }) {
  return (
    <div className="empty-block">
      <strong>{title}</strong>
      {body && <p>{body}</p>}
    </div>
  );
}

function formatChineseDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function formatScheduleTabLabel(dateString, index) {
  if (index === 0) return "今天";
  if (index === 1) return "明天";
  if (index === 2) return "后天";

  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date);
}

function buildScheduleDateTabs() {
  const today = getTodayDateString();
  return scheduleDayOffsets.map((offset, index) => {
    const date = addDaysToDateString(today, offset);
    return {
      id: date,
      label: formatScheduleTabLabel(date, index),
      date,
    };
  });
}

function normalizeScheduleItem(item = {}) {
  return {
    ...item,
    date: item.date || getTodayDateString(),
    startsAt: item.startsAt || "未安排",
    endsAt: item.endsAt || "",
    status: item.status || "pending",
    type: item.type || "todo",
    note: item.note || "",
    subtasks: Array.isArray(item.subtasks) ? item.subtasks : [],
  };
}

function normalizeScheduleItems(items) {
  return (Array.isArray(items) ? items : []).map(normalizeScheduleItem);
}

function getTimeFromDateTime(value) {
  if (!value) return "";
  const [, rawTime = ""] = value.split("T");
  return rawTime.split("+")[0].split("Z")[0].slice(0, 5);
}

function isTodayDateTime(value) {
  return Boolean(value && value.startsWith(getTodayDateString()));
}

function formatMonthDayTime(value) {
  if (!value) return "";
  const [datePart] = value.split("T");
  const [, month, day] = datePart.split("-");
  const time = getTimeFromDateTime(value);
  return `${Number(month)}月${Number(day)}日${time ? ` ${time}` : ""}`;
}

function formatReminderMeta(item) {
  const time = getTimeFromDateTime(item.dueAt);
  if (item.status !== "pending") return reminderStatusLabels[item.status] || item.status;
  if (isTodayDateTime(item.dueAt)) return `今天 ${time}`;
  return formatMonthDayTime(item.dueAt);
}

function getReminderOwnerRoleId(reminder = {}) {
  if (REMINDER_ROLE_BY_ID[reminder.ownerRole]) return reminder.ownerRole;
  if (reminder.group === "du") return "nortia";
  return "nortia";
}

function getReminderOwnerRole(reminder = {}) {
  return REMINDER_ROLE_BY_ID[getReminderOwnerRoleId(reminder)] || REMINDER_ROLE_META[0];
}

function getUpcomingScheduleItem(items) {
  return items
    .filter((item) => item.status === "pending")
    .sort((a, b) => String(a.startsAt || "").localeCompare(String(b.startsAt || "")))[0] || null;
}

function isUnscheduledSchedule(item = {}) {
  return !item.startsAt || item.startsAt === "未安排";
}

function getDefaultScheduleStartTime() {
  const date = new Date();
  const minutes = date.getMinutes();
  const roundedMinutes = minutes === 0 ? 0 : minutes <= 30 ? 30 : 0;
  if (minutes > 30) {
    date.setHours(date.getHours() + 1);
  }
  date.setMinutes(roundedMinutes, 0, 0);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function makeScheduleItem(title, date) {
  const now = Date.now();
  return {
    id: `schedule-${now}`,
    date,
    title,
    startsAt: getDefaultScheduleStartTime(),
    endsAt: "",
    status: "pending",
    type: "todo",
    note: "",
    subtasks: [],
  };
}

function ReminderStatusActions({ item, onSetStatus }) {
  function handleSetStatus(event, status) {
    event.stopPropagation();
    onSetStatus(item.id, status);
  }

  return (
    <div className="reminder-status-actions" aria-label={`${item.title}状态操作`}>
      <button type="button" onClick={(event) => handleSetStatus(event, "done")} disabled={item.status === "done"}>
        已完成
      </button>
      <button type="button" onClick={(event) => handleSetStatus(event, "snoozed")} disabled={item.status === "snoozed"}>
        已取消
      </button>
    </div>
  );
}

function ReminderDetailSheet({ reminder, onClose, onSetStatus }) {
  const ownerRole = getReminderOwnerRole(reminder);

  return (
    <div className="reminder-sheet-layer" role="presentation" onClick={onClose}>
      <section className="reminder-detail-sheet" role="dialog" aria-modal="true" aria-label={`${reminder.title}详情`} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="reminder-sheet-handle" onClick={onClose} aria-label="关闭提醒详情" />
        <div className="reminder-detail-sheet-body">
          <header>
            <span>{ownerRole.name} 的提醒</span>
            <h2>{reminder.title}</h2>
            <time>{formatReminderMeta(reminder)}</time>
          </header>
          <p>{reminder.body}</p>
          <dl>
            <div>
              <dt>状态</dt>
              <dd>{reminderStatusLabels[reminder.status] || reminder.status}</dd>
            </div>
            <div>
              <dt>来源</dt>
              <dd>{ownerRole.name}</dd>
            </div>
          </dl>
          <ReminderStatusActions item={reminder} onSetStatus={onSetStatus} />
        </div>
      </section>
    </div>
  );
}

function RemindersPanel({ onBack, onSetStatus, reminders }) {
  const [showHistory, setShowHistory] = useState(false);
  const [activeHistoryKind, setActiveHistoryKind] = useState("nortia");
  const [selectedReminderId, setSelectedReminderId] = useState(null);
  const reminderGroups = REMINDER_ROLE_META.map((role) => ({
    ...role,
    items: reminders.filter((item) => getReminderOwnerRoleId(item) === role.id && item.status === "pending"),
  }));
  const activeHistoryItems = reminders.filter((item) => getReminderOwnerRoleId(item) === activeHistoryKind && item.status !== "pending");
  const selectedReminder = selectedReminderId ? reminders.find((item) => item.id === selectedReminderId) : null;

  return (
    <div className="function-detail-page reminder-page">
      <header className="reminder-page-header">
        <button type="button" className="reminder-back-button" onClick={onBack} aria-label="返回聊天">
          <BackIcon />
        </button>
        <strong>提醒</strong>
        <button
          type="button"
          className={`reminder-history-button ${showHistory ? "is-active" : ""}`}
          onClick={() => setShowHistory((value) => !value)}
          aria-label={showHistory ? "返回当前提醒" : "历史提醒"}
        >
          <HistoryReminderIcon />
        </button>
      </header>

      <main className="reminder-page-body">
        {showHistory ? (
          <section className="reminder-history-view" aria-label="历史提醒">
            <div className="reminder-history-heading">
              <h2>历史提醒</h2>
              <p>已完成或已取消的提醒会先放在这里。</p>
            </div>

            <div className="reminder-history-tabs" role="tablist" aria-label="历史提醒分类">
              {REMINDER_ROLE_META.map((role) => (
                <button type="button" className={activeHistoryKind === role.id ? "is-active" : ""} onClick={() => setActiveHistoryKind(role.id)} role="tab" aria-selected={activeHistoryKind === role.id} key={role.id}>
                  {role.name}
                </button>
              ))}
            </div>

            <div className="reminder-history-list">
              {activeHistoryItems.length > 0 ? (
                activeHistoryItems.map((item) => (
                  <article className="reminder-history-card" key={item.id}>
                    <div>
                      <span>{getReminderOwnerRole(item).name}</span>
                      <time>{reminderStatusLabels[item.status] || item.status}</time>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                ))
              ) : (
                <EmptyBlock title="暂无历史提醒" body="已完成或已取消的提醒会出现在这里。" />
              )}
            </div>
          </section>
        ) : (
          <>
            {reminderGroups.map((group, index) => (
              <section className="reminder-memory-section" aria-label={`${group.name}的提醒`} key={group.id}>
                {index > 0 && <div className="reminder-divider" aria-hidden="true" />}
                <header className="reminder-section-heading">
                  <h2>{group.name}的提醒</h2>
                  <span aria-hidden="true" />
                </header>

                <div className="reminder-memory-cards">
                  {group.items.length > 0 ? (
                    group.items.map((reminder) => (
                      <article
                        className={`reminder-memory-card status-${reminder.status}`}
                        key={reminder.id}
                        onClick={() => setSelectedReminderId(reminder.id)}
                        onKeyDown={(event) => event.key === "Enter" && setSelectedReminderId(reminder.id)}
                        role="button"
                        tabIndex={0}
                      >
                        <small>{group.name}</small>
                        <p>{reminder.body}</p>
                        <time>{formatReminderMeta(reminder)}</time>
                        <ReminderStatusActions item={reminder} onSetStatus={onSetStatus} />
                      </article>
                    ))
                  ) : (
                    <EmptyBlock title="暂无待处理提醒" body={`${group.name}没有正在等待反馈的提醒。`} />
                  )}
                </div>
              </section>
            ))}
          </>
        )}
      </main>
      {selectedReminder && <ReminderDetailSheet reminder={selectedReminder} onClose={() => setSelectedReminderId(null)} onSetStatus={onSetStatus} />}
    </div>
  );
}

function ScheduleStatusTag({ status }) {
  return <span className={`schedule-status-tag status-${status}`}>{scheduleStatusLabels[status] || status}</span>;
}

function ScheduleCircle({ done = false }) {
  return <span className={`schedule-circle ${done ? "is-done" : ""}`} aria-hidden="true" />;
}

function ScheduleTaskSheet({ item, onClose, onSetStatus, onToggleSubtask, onUpdate }) {
  const [draft, setDraft] = useState(() => ({
    title: item.title || "",
    date: item.date || getTodayDateString(),
    startsAt: item.startsAt === "未安排" ? "" : item.startsAt || "",
    endsAt: item.endsAt || "",
    note: item.note || "",
  }));

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleSave() {
    const title = draft.title.trim();
    if (!title) return;

    onUpdate(item.id, {
      title,
      date: draft.date || getTodayDateString(),
      startsAt: draft.startsAt.trim() || "未安排",
      endsAt: draft.endsAt.trim(),
      note: draft.note.trim(),
    });
    onClose();
  }

  return (
    <div className="schedule-sheet-layer" role="presentation" onClick={onClose}>
      <section className="schedule-task-sheet" role="dialog" aria-modal="true" aria-label={`${item.title}详情`} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="schedule-sheet-handle" onClick={onClose} aria-label="关闭详情" />

        <div className="schedule-sheet-body">
          <header className="schedule-sheet-heading">
            <div>
              <span>{item.startsAt}</span>
              <ScheduleStatusTag status={item.status} />
            </div>
            <h2>{item.title}</h2>
          </header>

          <section className="schedule-sheet-section">
            <h3>EDIT</h3>
            <div className="schedule-edit-grid">
              <label>
                <span>标题</span>
                <input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
              </label>
              <label>
                <span>日期</span>
                <input type="date" value={draft.date} onChange={(event) => updateDraft("date", event.target.value)} />
              </label>
              <label>
                <span>开始</span>
                <input type="time" value={draft.startsAt} onChange={(event) => updateDraft("startsAt", event.target.value)} />
              </label>
              <label>
                <span>结束</span>
                <input type="time" value={draft.endsAt} onChange={(event) => updateDraft("endsAt", event.target.value)} />
              </label>
              <label className="is-wide">
                <span>备注</span>
                <textarea value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} rows={3} />
              </label>
            </div>
          </section>

          <section className="schedule-sheet-section">
            <h3>SUBTASKS</h3>
            <ul>
              {(item.subtasks?.length > 0 ? item.subtasks : [{ id: `${item.id}-empty`, title: "暂无拆分步骤", done: false }]).map((subtask) => (
                <li key={subtask.id}>
                  <button type="button" className="schedule-subtask-toggle" onClick={() => item.subtasks?.length > 0 && onToggleSubtask(item.id, subtask.id)} disabled={!item.subtasks?.length}>
                    <ScheduleCircle done={subtask.done} />
                    <span>{subtask.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="schedule-sheet-section">
            <h3>NOTES</h3>
            <p className="schedule-note-box">{item.note || "暂无备注。"}</p>
          </section>
        </div>

        <footer className="schedule-sheet-actions">
          <button type="button" className="schedule-delete-action" onClick={() => onSetStatus(item.id, "expired")}>
            <TrashIcon />
            标过期
          </button>
          <div>
            <button type="button" onClick={() => onSetStatus(item.id, "pending")}>待办</button>
            <button type="button" className="schedule-primary-action" onClick={() => onSetStatus(item.id, "done")}>完成</button>
            <button type="button" className="schedule-primary-action" onClick={handleSave} disabled={!draft.title.trim()}>保存</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function SchedulePanel({ onAddTodo, onSetStatus, onToggleSubtask, onUpdateSchedule, scheduleItems }) {
  const dateTabs = useMemo(() => buildScheduleDateTabs(), []);
  const [activeDate, setActiveDate] = useState(dateTabs[0]?.date || getTodayDateString());
  const [selectedScheduleId, setSelectedScheduleId] = useState(null);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [touchStartX, setTouchStartX] = useState(null);
  const [touchStartY, setTouchStartY] = useState(null);
  const visibleScheduleItems = scheduleItems.filter((item) => item.date === activeDate);
  const timedScheduleItems = visibleScheduleItems.filter((item) => !isUnscheduledSchedule(item));
  const unscheduledItems = visibleScheduleItems.filter(isUnscheduledSchedule);
  const nextItem = getUpcomingScheduleItem(timedScheduleItems);
  const pendingCount = visibleScheduleItems.filter((item) => item.type === "todo" && item.status === "pending").length;
  const doneCount = visibleScheduleItems.filter((item) => item.status === "done").length;
  const activeTab = dateTabs.find((tab) => tab.date === activeDate) || dateTabs[0];
  const selectedSchedule = selectedScheduleId ? scheduleItems.find((item) => item.id === selectedScheduleId) : null;

  function handleAddTodo(event) {
    event.preventDefault();
    const title = newTodoTitle.trim();
    if (!title) return;
    onAddTodo(title, activeDate);
    setNewTodoTitle("");
  }

  function shiftActiveDate(direction) {
    const currentIndex = dateTabs.findIndex((tab) => tab.date === activeDate);
    const nextIndex = Math.min(Math.max(currentIndex + direction, 0), dateTabs.length - 1);
    if (nextIndex !== currentIndex && dateTabs[nextIndex]) {
      setActiveDate(dateTabs[nextIndex].date);
    }
  }

  function handleTouchEnd(event) {
    if (touchStartX === null) return;
    const changedTouch = event.changedTouches[0];
    const deltaX = changedTouch?.clientX - touchStartX;
    const deltaY = touchStartY === null ? 0 : changedTouch?.clientY - touchStartY;
    setTouchStartX(null);
    setTouchStartY(null);

    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;
    shiftActiveDate(deltaX < 0 ? 1 : -1);
  }

  return (
    <div className="function-detail-page schedule-page">
      <header className="schedule-page-header">
        <span aria-hidden="true" />
        <div>
          <h1>日程</h1>
          <p>{formatChineseDate(activeDate)}</p>
        </div>
        <button type="button" aria-label="编辑日程">
          <EditIcon />
        </button>
      </header>

      <div
        className="schedule-page-body"
        onTouchStart={(event) => {
          setTouchStartX(event.touches[0]?.clientX ?? null);
          setTouchStartY(event.touches[0]?.clientY ?? null);
        }}
        onTouchEnd={handleTouchEnd}
      >
        <section className="schedule-summary" aria-label={`${activeTab?.label || "当日"}日程摘要`}>
          <p>{activeTab?.label || "当日"}待办 {pendingCount} 件 · 已完成 {doneCount} 件 · 下一项 {nextItem?.startsAt || "暂无"}</p>
          <blockquote>「先做一件最小的事。」</blockquote>
        </section>

        <nav className="schedule-date-tabs" aria-label="日期筛选">
          {dateTabs.map((tab) => (
            <button type="button" className={activeDate === tab.date ? "is-active" : ""} onClick={() => setActiveDate(tab.date)} key={tab.date}>
              {tab.label}
            </button>
          ))}
        </nav>

        <form className="schedule-add-row is-primary-entry" onSubmit={handleAddTodo}>
          <span aria-hidden="true">+</span>
          <input value={newTodoTitle} placeholder="添加事件" onChange={(event) => setNewTodoTitle(event.target.value)} />
          <button type="submit" disabled={!newTodoTitle.trim()}>
            添加
          </button>
        </form>

        <main className="schedule-content">
          <section className="schedule-next-section">
            <h2>下一项</h2>
            {nextItem ? (
              <button type="button" className="schedule-next-card" onClick={() => setSelectedScheduleId(nextItem.id)}>
                <ScheduleCircle />
                <div>
                  <time>{nextItem.startsAt}</time>
                  <strong>{nextItem.title}</strong>
                </div>
              </button>
            ) : (
              <EmptyBlock title="暂无下一项" body="今日待办已经清空。" />
            )}
          </section>

          <section className="schedule-today-section">
            <h2>{activeTab?.label || "当日"}</h2>
            <div className="schedule-timeline-list">
              {timedScheduleItems.length > 0 ? (
                timedScheduleItems.map((item) => (
                  <article className={`schedule-row status-${item.status}`} key={item.id}>
                    <button type="button" className="schedule-row-check" onClick={() => onSetStatus(item.id, item.status === "done" ? "pending" : "done")} aria-label={item.status === "done" ? "标记为待办" : "标记为完成"}>
                      <ScheduleCircle done={item.status === "done"} />
                    </button>
                    <button type="button" className="schedule-row-main" onClick={() => setSelectedScheduleId(item.id)}>
                      <div className="schedule-row-meta">
                        <time>{item.startsAt}</time>
                        <ScheduleStatusTag status={item.status} />
                      </div>
                      <strong>{item.title}</strong>
                    </button>
                  </article>
                ))
              ) : (
                <EmptyBlock title="暂无日程" body="可以在下面添加一件事。" />
              )}
            </div>
          </section>

          <section className="schedule-later-section">
            <h2>稍后 / 未安排</h2>
            {unscheduledItems.length > 0 ? (
              unscheduledItems.map((item) => (
                <button type="button" key={item.id} onClick={() => setSelectedScheduleId(item.id)}>
                  <span aria-hidden="true">•</span>
                  <strong>{item.title}</strong>
                  <small>{scheduleStatusLabels[item.status] || item.status}</small>
                </button>
              ))
            ) : (
              <EmptyBlock title="暂无未安排事项" body="在下面添加的新事项会先放到这里。" />
            )}
          </section>
        </main>
      </div>

      {selectedSchedule && (
        <ScheduleTaskSheet
          item={selectedSchedule}
          onClose={() => setSelectedScheduleId(null)}
          onSetStatus={onSetStatus}
          onToggleSubtask={onToggleSubtask}
          onUpdate={onUpdateSchedule}
        />
      )}
    </div>
  );
}

export default function FunctionPage({ initialPanel = "schedule", onDetailOverlayChange, onExit }) {
  const [reminders, setReminders] = useState(() => loadReminders(defaultReminderItems));
  const [scheduleItems, setScheduleItems] = useState(() => normalizeScheduleItems(loadSchedule(defaultScheduleItems)));
  const shouldHideBottomNav = initialPanel === "reminders";

  useEffect(() => {
    saveReminders(reminders);
  }, [reminders]);

  useEffect(() => {
    saveSchedule(scheduleItems);
  }, [scheduleItems]);

  useEffect(() => {
    onDetailOverlayChange?.(shouldHideBottomNav);
    return () => onDetailOverlayChange?.(false);
  }, [onDetailOverlayChange, shouldHideBottomNav]);

  function handleAddTodo(title, date) {
    setScheduleItems((items) => [...items, makeScheduleItem(title, date || getTodayDateString())]);
  }

  function handleScheduleStatus(scheduleId, status) {
    setScheduleItems((items) => items.map((item) => (item.id === scheduleId ? { ...item, status } : item)));
  }

  function handleUpdateSchedule(scheduleId, patch) {
    setScheduleItems((items) =>
      items.map((item) => (item.id === scheduleId ? normalizeScheduleItem({ ...item, ...patch }) : item)),
    );
  }

  function handleToggleSubtask(scheduleId, subtaskId) {
    setScheduleItems((items) =>
      items.map((item) =>
        item.id === scheduleId
          ? {
              ...item,
              subtasks: (item.subtasks || []).map((subtask) =>
                subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask,
              ),
            }
          : item,
      ),
    );
  }

  function handleReminderStatus(reminderId, status) {
    const reminder = reminders.find((item) => item.id === reminderId);
    setReminders((items) => items.map((item) => (item.id === reminderId ? { ...item, status } : item)));
    if (!reminder || !["done", "snoozed"].includes(status)) return;

    const ownerRole = getReminderOwnerRole(reminder);
    saveMessage({
      role: "user",
      content: `${reminderStatusLabels[status] || status}：${reminder.title}`,
      conversationId: ownerRole.chatSpaceId,
      chatSpaceId: ownerRole.chatSpaceId,
      meta: {
        source: "reminder_feedback",
        reminderId,
        reminderOwnerRole: ownerRole.id,
        reminderStatus: status,
      },
    }).catch(() => {});
  }

  if (initialPanel === "reminders") {
    return (
      <section className="function-root">
        <RemindersPanel reminders={reminders} onBack={onExit} onSetStatus={handleReminderStatus} />
      </section>
    );
  }

  return (
    <section className="function-root">
      <SchedulePanel
        scheduleItems={scheduleItems}
        onAddTodo={handleAddTodo}
        onSetStatus={handleScheduleStatus}
        onToggleSubtask={handleToggleSubtask}
        onUpdateSchedule={handleUpdateSchedule}
      />
    </section>
  );
}
