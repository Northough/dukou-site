import { useEffect, useMemo, useRef, useState } from "react";
import { completeCommand, startCommand, subscribeCommands } from "../api/commandTransport.js";

const CANCEL_HOLD_MS = 900;
const SWIPE_COMPLETE_PX = -72;
const SWIPE_COLLAPSE_PX = 72;

function formatDuration(ms) {
  const absoluteMs = Math.abs(ms);
  const totalSeconds = Math.floor(absoluteMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${ms < 0 ? "+" : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatStartTime(value) {
  if (!value) return "";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} \u8d77`;
}

function getRemainingMs(command, nowMs) {
  if (!command?.started_at || !command.countdown_seconds) return 0;
  return command.started_at + command.countdown_seconds * 1000 - nowMs;
}

function getElapsedMs(command, nowMs) {
  if (!command?.started_at) return 0;
  return Math.max(0, nowMs - command.started_at);
}

export default function CommandFloatWindow({ onCommandCompleted, onCommandCanceled }) {
  const [queue, setQueue] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [cancelProgress, setCancelProgress] = useState(0);
  const canceledIdsRef = useRef(new Set());
  const cancelStartRef = useRef(0);
  const swipeStartRef = useRef(null);

  useEffect(() => {
    return subscribeCommands((commands) => {
      setQueue(commands.filter((command) => !canceledIdsRef.current.has(String(command.id))));
    });
  }, []);

  const activeCommand = useMemo(() => {
    if (!queue.length) return null;
    return queue.find((command) => String(command.id) === String(activeId)) || queue[0];
  }, [activeId, queue]);

  useEffect(() => {
    if (!activeCommand) {
      setActiveId("");
      setExpanded(false);
      return;
    }
    setActiveId(String(activeCommand.id));
    if (!activeCommand.started_at) {
      startCommand(activeCommand.id).then((started) => {
        if (!started) return;
        setQueue((current) => current.map((command) => (String(command.id) === String(started.id) ? started : command)));
      });
    }
  }, [activeCommand]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setNowMs(Date.now());
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!activeCommand) return null;

  const hasCountdown = Boolean(activeCommand.countdown_seconds);
  const remainingMs = getRemainingMs(activeCommand, nowMs);
  const elapsedMs = getElapsedMs(activeCommand, nowMs);
  const overdue = hasCountdown && remainingMs < 0;
  const totalMs = hasCountdown ? activeCommand.countdown_seconds * 1000 : Math.max(elapsedMs, 1000);
  const progress = hasCountdown ? Math.max(0, Math.min(1, remainingMs / totalMs)) : Math.min(1, (elapsedMs % 60000) / 60000);
  const ringProgress = hasCountdown ? (overdue ? 1 : 1 - progress) : progress;
  const timeText = hasCountdown ? formatDuration(remainingMs) : formatDuration(elapsedMs);
  const startTimeText = formatStartTime(activeCommand.started_at);
  const queueCount = queue.length;
  const taskTypeText = hasCountdown ? "\u5012\u8ba1\u65f6\u4efb\u52a1" : "\u8ba1\u65f6\u4efb\u52a1";

  const completeActive = async () => {
    const completed = await completeCommand(activeCommand.id);
    onCommandCompleted?.({ ...activeCommand, ...(completed || {}) });
    setQueue((current) => current.filter((command) => String(command.id) !== String(activeCommand.id)));
    setExpanded(false);
    return completed;
  };

  const cancelActive = () => {
    canceledIdsRef.current.add(String(activeCommand.id));
    onCommandCanceled?.(activeCommand);
    setQueue((current) => current.filter((command) => String(command.id) !== String(activeCommand.id)));
    setCancelProgress(0);
    setExpanded(false);
  };

  const startCancelHold = () => {
    cancelStartRef.current = Date.now();
    const update = () => {
      if (!cancelStartRef.current) return;
      const nextProgress = Math.min(1, (Date.now() - cancelStartRef.current) / CANCEL_HOLD_MS);
      setCancelProgress(nextProgress);
      if (nextProgress >= 1) {
        cancelStartRef.current = 0;
        cancelActive();
        return;
      }
      window.requestAnimationFrame(update);
    };
    window.requestAnimationFrame(update);
  };

  const stopCancelHold = () => {
    cancelStartRef.current = 0;
    setCancelProgress(0);
  };

  const handlePointerDown = (event) => {
    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = Math.abs(event.clientY - start.y);
    if (dx <= SWIPE_COMPLETE_PX && dy < 48) completeActive();
    if (dx >= SWIPE_COLLAPSE_PX && dy < 48) setExpanded(false);
  };

  if (!expanded) {
    return (
      <button
        className={`command-float-rail${overdue ? " is-overdue" : ""}`}
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="\u6253\u5f00\u6307\u4ee4\u6d6e\u7a97"
      >
        <span className="command-rail-line" aria-hidden="true">
          <i style={{ transform: `scaleY(${hasCountdown ? 1 - progress : progress})` }} />
        </span>
        <span className="command-rail-countdown" style={{ "--command-ring-progress": ringProgress }} aria-hidden="true">
          <i />
        </span>
        <strong>{timeText}</strong>
        {queueCount > 1 && <small>{queueCount}</small>}
      </button>
    );
  }

  return (
    <section
      className={`command-float-card${overdue ? " is-overdue" : ""}`}
      aria-label="\u6307\u4ee4\u6d6e\u7a97"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        swipeStartRef.current = null;
      }}
    >
      <header>
        <span className="command-float-icon">{"\u25cf"}</span>
        <div>
          <strong>{activeCommand.title}</strong>
          <small>{`${taskTypeText} \u00b7 \u5de6\u6ed1\u5b8c\u6210\uff0c\u53f3\u6ed1\u6536\u8d77`}</small>
        </div>
        {queueCount > 1 && <em>{`${queueCount} \u6761`}</em>}
        <button
          className="command-collapse-button"
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="\u6536\u8d77\u6307\u4ee4\u6d6e\u7a97"
        >
          ^
        </button>
      </header>
      <div className="command-float-time-wrap">
        <div className="command-float-time">{timeText}</div>
        {startTimeText && <small className="command-start-time">{startTimeText}</small>}
      </div>
      <div className="command-float-progress" aria-hidden="true">
        <i style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="command-float-actions">
        <button
          className="command-cancel-button"
          type="button"
          onPointerDown={startCancelHold}
          onPointerUp={stopCancelHold}
          onPointerLeave={stopCancelHold}
          style={{ "--cancel-progress": cancelProgress }}
        >
          {"\u53d6\u6d88"}
        </button>
        <button className="command-complete-button" type="button" onClick={completeActive}>
          {"\u5b8c\u6210"}
        </button>
      </div>
    </section>
  );
}
