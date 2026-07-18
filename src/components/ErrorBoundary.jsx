import { Component } from "react";
import { B } from "../theme.js";
import { reportError } from "../lib/errors.js";

// React only catches render faults through a class component, which is
// why this one isn't written with hooks like everything else.
//
// Two levels of this are used. One around each section, so a fault in
// Documents leaves the rest of the hub working and offers a way back.
// One around the whole app, as a last resort.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { failed: true, message: (error && error.message) || "Unknown error" };
  }

  componentDidCatch(error, info) {
    reportError(error, {
      componentStack: info && info.componentStack,
      page: this.props.label || "app",
      fullName: this.props.fullName || null,
    });
  }

  reset = () => this.setState({ failed: false, message: "" });

  render() {
    if (!this.state.failed) return this.props.children;

    const { label, onBack } = this.props;

    return (
      <div style={{ padding: this.props.fullPage ? "60px 20px" : "10px 0" }}>
        <div style={{ background: B.white, border: `1px solid ${B.border}`, borderTop: `3px solid ${B.red}`, borderRadius: 12, padding: "22px 24px", maxWidth: 460, margin: "0 auto", fontFamily: "'Open Sans',sans-serif" }}>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 16, color: B.black, marginBottom: 8 }}>
            {label ? `${label} stopped working` : "Something stopped working"}
          </div>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#4B5563", lineHeight: 1.65 }}>
            This isn't your fault and nothing you did has been lost. The problem has been reported automatically, so an admin can see what happened.
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={this.reset}
              style={{ background: B.blue, color: B.white, border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" }}
            >
              Try again
            </button>
            {onBack ? (
              <button
                onClick={() => { this.reset(); onBack(); }}
                style={{ background: B.white, color: "#4B5563", border: `1px solid ${B.border}`, borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" }}
              >
                Go back
              </button>
            ) : null}
            <button
              onClick={() => window.location.reload()}
              style={{ background: B.white, color: "#4B5563", border: `1px solid ${B.border}`, borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" }}
            >
              Reload the app
            </button>
          </div>

          <details style={{ marginTop: 16 }}>
            <summary style={{ fontSize: 11.5, color: B.muted, cursor: "pointer" }}>Technical detail</summary>
            <div style={{ marginTop: 8, fontSize: 11, color: B.muted, background: B.offWhite, padding: "9px 11px", borderRadius: 7, overflowWrap: "anywhere", lineHeight: 1.5 }}>
              {this.state.message}
            </div>
          </details>
        </div>
      </div>
    );
  }
}
