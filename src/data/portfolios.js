// The six NEC seats from the governance amendment (YCDI-GOV-007-A1).
// A seat is a label and a routing target, not an access grant: whoever
// holds one keeps exactly the access their own role and admin flag give
// them. The National Coordinator is a role on the profile, not a seat
// handed out here, so it is not in this list.
//
// BATCH18-MARKER nec-portfolios

export const PORTFOLIOS = [
  { code: "DNC",   label: "Deputy National Coordinator",    duty: "Partnerships and fundraising" },
  { code: "SEC",   label: "National Secretary",             duty: "Digital custodianship and data protection" },
  { code: "FIN",   label: "National Financial Secretary",   duty: "Donor records and grant financial reporting" },
  { code: "PD",    label: "National Programmes Director",    duty: "Spiritual formation, curriculum and M&E" },
  { code: "VC",    label: "National Volunteer Coordinator",  duty: "Safeguarding compliance administration" },
  { code: "COMMS", label: "National Communications Officer", duty: "Alumni network communication" },
];

export const PORTFOLIO_LABEL = Object.fromEntries(PORTFOLIOS.map((p) => [p.code, p.label]));
export const PORTFOLIO_DUTY = Object.fromEntries(PORTFOLIOS.map((p) => [p.code, p.duty]));
