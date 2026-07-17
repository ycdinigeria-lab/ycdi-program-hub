export const DISCIPLESHIP_STAGES = [
  { stage: "Contact", ref: "Matt 28:19", desc: "Initial engagement through YCDI programs or community outreach.", activities: ["School visit attendance", "Conference participation", "Friend referral", "Social media engagement"], responsibility: "Regional Coordinator / Volunteer", indicator: "Young person attends at least one YCDI program" },
  { stage: "Connect", ref: "Acts 2:42", desc: "The young person builds relationship with YCDI community and shows interest in faith.", activities: ["Joins chapter fellowship", "Exchanges contacts with volunteer", "Receives YCDI devotional content", "Attends follow-up meeting"], responsibility: "Assigned Volunteer Mentor", indicator: "Attendance at 2+ consecutive chapter meetings" },
  { stage: "Commit", ref: "Rom 10:9", desc: "The young person makes a personal commitment to Jesus Christ.", activities: ["Public profession of faith", "Baptism where applicable", "Signs YCDI discipleship covenant", "Assigned an accountability partner"], responsibility: "Chapter Lead / RC", indicator: "Documented commitment and church connection" },
  { stage: "Grow", ref: "2 Pet 3:18", desc: "Active spiritual formation through Bible study, mentoring, and community.", activities: ["Weekly devotional engagement", "Monthly one-on-one mentoring", "Bible reading plan", "Serving in chapter programs"], responsibility: "Mentor and Chapter Community", indicator: "Consistent engagement for 6+ months" },
  { stage: "Multiply", ref: "2 Tim 2:2", desc: "Mature young leader who now mentors others and leads within YCDI.", activities: ["Becomes a YCDI volunteer", "Mentors a new Contact or Connect", "Leads a program or devotional", "Trains in facilitation skills"], responsibility: "RC and NEC", indicator: "At least one person they are actively discipling" },
];

export const TEACHING_OUTLINE = [
  { step: "1. The Text", desc: "Open with the biblical passage. Read it clearly. Establish it as the authority." },
  { step: "2. The Context", desc: "Brief background - who wrote it, to whom, and why. Makes Scripture alive and real." },
  { step: "3. The Truth", desc: "The one central truth of the passage. Every teaching has ONE main point, not five." },
  { step: "4. The Tension", desc: "Where does this truth confront or challenge how we actually live?" },
  { step: "5. The Application", desc: "What specific, practical action should the listener take this week?" },
  { step: "6. The Invitation", desc: "An opportunity to respond - in prayer, commitment, or surrender to Christ." },
];

export const CHARACTER_STANDARDS = [
  { name: "Integrity", ref: "Psalm 15:2", desc: "Walking the same in public and in private. No gap between appearance and reality." },
  { name: "Purity", ref: "1 Tim 4:12", desc: "Sexual, moral, and digital purity. Guarding the heart in conduct and conversation." },
  { name: "Humility", ref: "Phil 2:3-4", desc: "Considering others better than yourself. Serving without seeking recognition." },
  { name: "Faithfulness", ref: "Matt 25:21", desc: "Doing what you said you would do. Showing up. Being reliable in small things." },
  { name: "Generosity", ref: "2 Cor 9:7", desc: "Giving freely of time, gifts, and resources. A cheerful giver." },
  { name: "Accountability", ref: "Prov 27:17", desc: "Welcoming correction. Being open about struggles. Iron sharpening iron." },
  { name: "Respect", ref: "1 Pet 2:17", desc: "Honouring every person - young people, parents, school staff, community leaders." },
  { name: "Perseverance", ref: "Gal 6:9", desc: "Not giving up when ministry is hard. Keeping faith through seasons of difficulty." },
  { name: "Learning", ref: "Prov 1:5", desc: "Staying teachable. Growing in knowledge and skill throughout life." },
  { name: "Joy", ref: "Neh 8:10", desc: "The joy of the Lord as strength. Ministry flows from delight, not obligation." },
];

export const PRAYER_CALENDAR = [
  { meeting: "Chapter Monthly Prayer", frequency: "Monthly", duration: "90 mins", led: "Regional Coordinator", focus: "Chapter programs, volunteers, students, local community" },
  { meeting: "NEC Monthly Prayer", frequency: "Monthly", duration: "60 mins", led: "National Coordinator", focus: "National strategy, inter-chapter unity, leadership, finances" },
  { meeting: "Board Prayer Meeting", frequency: "Quarterly", duration: "45 mins", led: "Board Chair", focus: "Governance, organizational direction, trustees personal lives" },
  { meeting: "Pre-Program Prayer", frequency: "Before every program", duration: "30 mins", led: "Program Lead", focus: "Protection, anointing, open hearts among beneficiaries" },
  { meeting: "National Day of Fasting", frequency: "Quarterly", duration: "Full day", led: "NC and Founder", focus: "National spiritual alignment, major organizational decisions" },
  { meeting: "Annual Prayer Night", frequency: "Annually", duration: "Evening", led: "Founder / Senior Leadership", focus: "Year in review, consecration for new year, corporate intercession" },
];

export const COUNSELLING_REFERRAL = [
  { concern: "Suicidal ideation or self-harm", response: "Do NOT attempt to counsel. Immediately refer to qualified mental health professional. Notify RC and NC. Contact family.", level: "CRISIS" },
  { concern: "Sexual or physical abuse disclosure", response: "Listen without judgment. Do NOT promise confidentiality. Activate safeguarding protocol. Report per CP Policy.", level: "MANDATORY REPORT" },
  { concern: "Grief and bereavement", response: "Offer pastoral presence and prayer. Share Scriptures of comfort. Refer to counsellor if prolonged.", level: "Pastoral + Referral" },
  { concern: "Academic pressure or failure", response: "Encourage, pray, connect to mentoring. Share relevant Scriptures. Referral not usually required.", level: "Pastoral only" },
  { concern: "Family conflict", response: "Listen, pray, encourage reconciliation. Do not take sides. Refer to pastor if involving abuse.", level: "Pastoral + Pastor" },
  { concern: "Addiction", response: "Compassionate pastoral care. Refer to qualified Christian counsellor or rehab. Inform RC.", level: "Refer to counsellor" },
  { concern: "Spiritual doubt or crisis of faith", response: "Sit with them. Share your own journey. Study Scripture together. Connect to a pastor.", level: "Pastoral - extended" },
  { concern: "Relationship or romantic issues", response: "Provide biblical guidance on purity. Do not create dependency. Refer to pastor for ongoing support.", level: "Pastoral + Boundaries" },
];
