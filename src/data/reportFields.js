// The full YCDI-PROG-001 post-program report schema, lifted field-for-field
// from the live app. Section letters (A-G) match what's printed on the
// downloadable report and shown on screen.

export const ENGAGEMENT_OPTIONS = [
  "Excellent — highly engaged throughout",
  "Good — mostly engaged with some distraction",
  "Fair — mixed engagement",
  "Poor — difficult to engage the audience",
];

export const TEACHING_METHOD_OPTIONS = [
  "Interactive teaching with Q&A",
  "Lecture / presentation",
  "Group discussion",
  "Drama / role-play",
  "Testimony sharing",
  "Workshop / activity-based",
  "Mixed methods",
];

export function emptyReportForm(budgetApproved) {
  return {
    report_date: new Date().toISOString().slice(0, 10),
    reporting_coordinator: "",
    actual_start_time: "", actual_end_time: "", venue_confirmed: "",
    prayer_meeting_held: "", prayer_meeting_attendees: "",
    total_attendance: "", male_count: "", female_count: "",
    age_10_14: "", age_15_19: "", age_20_25: "",
    first_time_attendees: "", returning_attendees: "",
    schools_represented: "", volunteers_deployed: "",
    program_ran_as_planned: "", deviations: "",
    topics_covered: "", teaching_method: "", audience_engagement: "",
    three_test_mission: "", three_test_quality: "", three_test_safety: "",
    materials_used: "",
    commitments_to_christ: "", recommitments: "", testimonials_count: "",
    testimonials_detail: "", prayer_requests: "", discipleship_followups: "",
    students_joining_fellowship: "",
    incidents_occurred: "", incident_details: "",
    two_volunteer_rule_observed: "", parental_consents_obtained: "",
    school_permission_obtained: "", welfare_concerns: "", referrals_made: "",
    budget_approved: budgetApproved || "", actual_expenditure: "",
    variance_explanation: "", receipts_obtained: "", outstanding_payments: "",
    what_went_well: "", what_could_improve: "", recommendations: "",
    follow_up_actions: "", follow_up_responsible: "", follow_up_deadline: "",
    next_program_suggested: "", coordinator_signature_confirmed: "",
  };
}

// Converts the form-state field names into the DB column names the
// `reports` table actually uses (a handful of them differ, e.g.
// total_attendance -> attendance). Matches the live app exactly.
export function reportFormToRow(programId, u) {
  return {
    program_id: programId,
    report_date: u.report_date,
    reporting_coordinator: u.reporting_coordinator,
    actual_start_time: u.actual_start_time,
    actual_end_time: u.actual_end_time,
    venue_confirmed: u.venue_confirmed,
    prayer_meet: u.prayer_meeting_held === "yes",
    prayer_meeting_attendees: parseInt(u.prayer_meeting_attendees) || 0,
    attendance: parseInt(u.total_attendance) || 0,
    male_count: parseInt(u.male_count) || 0,
    female_count: parseInt(u.female_count) || 0,
    age_10_14: parseInt(u.age_10_14) || 0,
    age_15_19: parseInt(u.age_15_19) || 0,
    age_20_25: parseInt(u.age_20_25) || 0,
    first_time_attendees: parseInt(u.first_time_attendees) || 0,
    returning_attendees: parseInt(u.returning_attendees) || 0,
    schools_represented: u.schools_represented,
    volunteers_deployed: parseInt(u.volunteers_deployed) || 0,
    program_ran_as_planned: u.program_ran_as_planned === "yes",
    deviations: u.deviations,
    topics_covered: u.topics_covered,
    teaching_method: u.teaching_method,
    audience_engagement: u.audience_engagement,
    three_test_mission: u.three_test_mission,
    three_test_quality: u.three_test_quality,
    three_test_safety: u.three_test_safety,
    materials_used: u.materials_used,
    commitments_to_christ: parseInt(u.commitments_to_christ) || 0,
    recommitments: parseInt(u.recommitments) || 0,
    testimonials: parseInt(u.testimonials_count) || 0,
    testimonials_detail: u.testimonials_detail,
    prayer_requests: u.prayer_requests,
    discipleship_followups: u.discipleship_followups,
    students_joining_fellowship: parseInt(u.students_joining_fellowship) || 0,
    incidents: u.incidents_occurred === "yes" ? 1 : 0,
    incident_details: u.incident_details,
    two_volunteer_rule: u.two_volunteer_rule_observed === "yes",
    parental_consents: u.parental_consents_obtained === "yes",
    school_permission: u.school_permission_obtained === "yes",
    welfare_concerns: u.welfare_concerns,
    referrals_made: u.referrals_made,
    budget_approved: parseFloat(u.budget_approved) || 0,
    actual_expenditure: parseFloat(u.actual_expenditure) || 0,
    variance_explanation: u.variance_explanation,
    receipts_obtained: u.receipts_obtained === "yes",
    outstanding_payments: u.outstanding_payments,
    what_went_well: u.what_went_well,
    what_could_improve: u.what_could_improve,
    recommendations: u.recommendations,
    follow_up_actions: u.follow_up_actions,
    follow_up_responsible: u.follow_up_responsible,
    follow_up_deadline: u.follow_up_deadline,
    next_program_suggested: u.next_program_suggested,
    outcome: u.what_went_well,
  };
}

export function stepIsValid(step, u) {
  if (step === 0) return !!(u.report_date && u.reporting_coordinator && u.prayer_meeting_held);
  if (step === 1) return !!(u.total_attendance && u.male_count && u.female_count);
  if (step === 2) return !!(u.program_ran_as_planned && u.topics_covered && u.three_test_mission && u.three_test_quality && u.three_test_safety);
  if (step === 4) return !!(u.incidents_occurred && u.two_volunteer_rule_observed);
  if (step === 5) return !!(u.actual_expenditure && u.receipts_obtained);
  if (step === 6) return !!(u.what_went_well && u.what_could_improve && u.coordinator_signature_confirmed);
  return true;
}

export const REPORT_STEPS = [
  "A. Program overview",
  "B. Attendance and reach",
  "C. Program delivery",
  "D. Spiritual impact",
  "E. Safeguarding and welfare",
  "F. Financial accountability",
  "G. Lessons learned and follow-up",
];
