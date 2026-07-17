import { B } from "../theme.js";
import { Card } from "../components/ui.jsx";

export default function ComingSoon({ title, note }) {
  return (
    <Card style={{ textAlign: "center", padding: "40px 24px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif", marginBottom: 8 }}>{title}</div>
      <p style={{ fontSize: 13, color: B.muted, lineHeight: 1.6, maxWidth: 440, margin: "0 auto" }}>{note}</p>
    </Card>
  );
}
