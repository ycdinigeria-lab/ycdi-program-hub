import { useState, useRef, useEffect, useId } from "react";
import { B } from "../theme.js";
import { Avatar } from "./ui.jsx";
import Icon from "./Icon.jsx";

// BATCH41-MARKER header-user-menu
//
// The name in the desktop header opens a small menu: My profile and Sign
// out. Sign out used to sit in the sidebar footer where it was always on
// show; tucking it here makes it available without making it prominent.
//
// Keyboard: Enter, Space or the down arrow opens it and lands on the first
// item. Up and down move, Home and End jump, Escape closes and hands focus
// back to the name, and Tab simply closes it. A click anywhere outside
// closes it too.

const NAV_KEYS = ["ArrowDown", "ArrowUp", "Home", "End"];

// Pure so it can be tested without a browser. `current` is -1 when focus is
// not on any item yet.
export function nextMenuIndex(key, current, count) {
  if (count <= 0) return -1;
  if (key === "ArrowDown") return current < 0 ? 0 : (current + 1) % count;
  if (key === "ArrowUp") return current < 0 ? count - 1 : (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return current;
}

export default function UserMenu({ name, roleLine, onProfile, onSignOut }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const trigger = useRef(null);
  const itemRefs = useRef([]);
  const menuId = useId();

  const actions = [
    { label: "My profile", icon: "user", run: onProfile },
    { label: "Sign out", icon: "logout", run: onSignOut },
  ];

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open && itemRefs.current[0]) itemRefs.current[0].focus();
  }, [open]);

  function close(giveFocusBack) {
    setOpen(false);
    if (giveFocusBack && trigger.current) trigger.current.focus();
  }

  function onMenuKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(true); return; }
    if (e.key === "Tab") { setOpen(false); return; }
    if (NAV_KEYS.includes(e.key)) {
      e.preventDefault();
      const at = itemRefs.current.indexOf(document.activeElement);
      const to = nextMenuIndex(e.key, at, actions.length);
      if (itemRefs.current[to]) itemRefs.current[to].focus();
    }
  }

  function onTriggerKey(e) {
    if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); }
  }

  return (
    <div className="hub-menu-wrap" ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className="hub-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <Avatar name={name} size={32} decorative />
        <span style={{ textAlign: "left" }}>
          <span style={{ display: "block", fontSize: 12.5, color: B.black, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", lineHeight: 1.2 }}>{name}</span>
          <span style={{ display: "block", fontSize: 11, color: B.muted }}>{roleLine}</span>
        </span>
        <Icon name="chevronDown" size={16} style={{ color: B.muted }} />
      </button>

      {open ? (
        <div id={menuId} role="menu" aria-label="Account" className="hub-menu-panel" onKeyDown={onMenuKey}>
          {actions.map((a, i) => (
            <button
              key={a.label}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              role="menuitem"
              className="hub-menu-item"
              onClick={() => { close(false); a.run(); }}
            >
              <Icon name={a.icon} size={16} style={{ color: B.muted }} />
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
