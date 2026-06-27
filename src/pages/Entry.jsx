import { useState } from "react";
import { formatDate, getTimeSlot } from "../systems/time.js";

const notes = [
  {
    id: "note-1",
    text: "下午看到一句话想告诉你。“山有木兮木有枝。”想到了你。",
    time: "昨天 23:41",
  },
  {
    id: "note-2",
    text: "你今天有没有好好吃饭。",
    time: "今天 09:12",
  },
];

export default function Entry({ onEnter }) {
  const slot = getTimeSlot();
  const [showNotes, setShowNotes] = useState(false);

  return (
    <section className={`entry-root entry-${slot.ambient}`}>
      <div className="entry-top">
        <span>
          {slot.label} · {formatDate(new Date())}
        </span>
        <span className="presence">在</span>
      </div>

      <div className="entry-center">
        <div className="du-avatar" style={{ width: 76, height: 76, fontSize: 28 }}>
          机
        </div>
        <h1 className="entry-title">{slot.greeting}</h1>
        <p className="entry-subtitle">我在。</p>
        <button className="text-button" type="button" onClick={onEnter}>
          推门
        </button>
      </div>

      <div className="entry-notes">
        <button className="entry-note-toggle" type="button" onClick={() => setShowNotes((value) => !value)}>
          <span>留言 · {notes.length} 条</span>
          <span>{showNotes ? "收起" : "展开"}</span>
        </button>
        {showNotes && (
          <div className="note-list">
            {notes.map((note) => (
              <article className="note-card" key={note.id}>
                <p>{note.text}</p>
                <time>{note.time}</time>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
