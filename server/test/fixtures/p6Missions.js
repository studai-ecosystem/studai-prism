// P6 acceptance fixtures: synthetic learner work for each of the ten DRAFT
// missions (base scene). Nothing here is real learner data. Each mission has
//   valid       — a short answer that meets its criteria (deterministic + meaning)
//   paraphrase  — the same intents in different words and sentence shapes
//   filler      — ~300 characters that say nothing (no fact, no intent)
//   copyTarget  — the artifact (and field) a copied example lands in
// plus M09/M10 cases for a missing owner and a justified escalation.
export const FILLER = 'Thanks so much for sorting all of this out, really appreciate it, all good on my side and happy to go along with whatever works best for everyone involved, just let me know if there is anything else at all that you might need from me and I will see what I can do, cheers and speak soon, all the best.'

export const MISSION_FIXTURES = {
  'MIS-CORE-MISSING-FACT-01': {
    valid: { REPLY: { text: 'Before I can confirm anything about Room 2, could you tell me how many people will actually be coming along? Two other teams were invited last week and the room only seats twelve, which worries me. Rather than confirming today, I would prefer to hold the booking as provisional while we find out.' } },
    paraphrase: { REPLY: { text: 'Thanks Dev, but I do not yet have a headcount for Tuesday, and that matters because the room seats twelve. Could you check with the other two teams who were invited last week? Once I know the total I will either confirm Room 2 or look for somewhere larger.' } },
    filler: { REPLY: { text: FILLER } },
    copyTarget: { artifact: 'REPLY' },
  },
  'MIS-CORE-CHECK-RECOMMENDATION-01': {
    valid: { CHECK: { fields: {
      decision: 'No, I would not go ahead as written because the delivery time does not work.',
      claim_checked: 'The claim that the supplier delivers in two days.',
      what_found: 'The supplier page actually says delivery takes four working days, and Friday is only three working days away, so the packs would arrive after the session.',
      uncertain: 'I am still unsure whether more people will confirm before Friday, which would change how many packs we need.',
      alternative: 'Order 50 packs today from the local print shop that delivers next day, and top up later if needed.',
    } } },
    paraphrase: { CHECK: { fields: {
      decision: 'No, not as written.',
      claim_checked: 'I went back to the two-day delivery claim in the summary.',
      what_found: 'When I compared it with the supplier page, the lead time quoted there is four days, not two, which means nothing would land before Friday.',
      uncertain: 'What I do not know is whether late confirmations will push the number above 48, and that would affect the order size.',
      alternative: 'Print 50 in-house tomorrow and skip the supplier entirely for this run.',
    } } },
    filler: { CHECK: { fields: { what_found: FILLER } } },
    copyTarget: { artifact: 'CHECK', field: 'what_found' },
  },
  'MIS-CORE-EXPLAIN-DECISION-01': {
    valid: { NOTE: { text: 'We will run two shorter onboarding sessions instead of one long one. Here is why: our usual room holds fifteen at most, but twenty-two colleagues have signed up, which simply will not work in a single sitting. Could you please book two ninety-minute slots for us next week, ideally Tuesday and Wednesday afternoon, and confirm them by Thursday?' } },
    paraphrase: { NOTE: { text: 'Decision: we are going ahead with two sessions rather than one long one. Twenty-two have signed up and the space takes fifteen, so a single session would leave seven people standing. Please reserve a pair of afternoon slots next week and let me know by Friday.' } },
    filler: { NOTE: { text: FILLER } },
    copyTarget: { artifact: 'NOTE' },
  },
  'MIS-CORE-HANDOVER-01': {
    valid: {
      BOARD: { rows: [{ id: 'quotes', owner: 'Sam' }, { id: 'checklist', owner: 'Ask Priya to decide by Wednesday' }] },
      MESSAGE: { text: 'Sam, two tasks have no owner yet: the vendor quotes (due Thursday) and the launch checklist (due Friday). Please call the venue to confirm the quote first.' },
      PLAN: { fields: { first_step: 'Call the venue to confirm the quote before anything else.', checkpoint: 'Thursday 10:30 am' } },
    },
    paraphrase: {
      BOARD: { rows: [{ id: 'quotes', owner: 'Sam' }, { id: 'checklist', owner: 'Priya decides' }] },
      MESSAGE: { text: 'Two things are still unowned while I am away, Sam: the vendor quotes that are due on Thursday, and the launch checklist due Friday. Start with the venue call so the quote is locked in.' },
      PLAN: { fields: { first_step: 'Ring the venue and lock in the quote.', checkpoint: 'Friday at 2 pm' } },
    },
    filler: { MESSAGE: { text: FILLER } },
    copyTarget: { artifact: 'MESSAGE' },
  },
  'MIS-CORE-DISAGREE-01': {
    valid: { REPLY: { text: 'You are right that printing takes an afternoon we simply do not have this week, and plenty of handouts do end up unread. Where I see it differently: roughly half of our participants arrive without laptops, and during the exercises those people would be left with nothing in front of them. What if we print a single page for just those people and keep everything else digital, then review after Thursday?' } },
    paraphrase: { REPLY: { text: 'Fair point about the printing, Mina: an afternoon spent at the copier is genuinely hard to justify when the whole week is already overbooked. I still think we need paper for the participants who turn up with no laptop though, otherwise they sit there with nothing to work from during the exercises. How about we survey everyone on Monday morning to see who genuinely wants a paper copy, and then print exactly that number rather than a full set?' } },
    filler: { REPLY: { text: FILLER } },
    copyTarget: { artifact: 'REPLY' },
  },
  'MIS-CORE-BOUNDARY-01': {
    valid: { REPLY: { fields: {
      can_do: 'I can do the room setup from 8:00 and the welcome at 9:00 as planned, and I can cover the corridor desk until 8:50.',
      cannot_do: 'I cannot run the sign-in desk from 8:30 onwards, because by then I have to be inside finishing the setup and then opening the welcome, which would put me in two places at once.',
      instead: 'I can hand the desk to a volunteer at 8:50 with the list printed and ready.',
      who_decides: 'Priya decides if the desk must be covered after 8:50.',
    } } },
    paraphrase: { REPLY: { fields: {
      can_do: 'Setup and the welcome, as agreed.',
      cannot_do: 'The desk would overlap with both things I already own on Thursday morning, so taking it on is not realistic.',
      instead: 'What I can offer is to brief whoever takes the desk and leave them a printed list by 8:15.',
      who_decides: 'Priya.',
    } } },
    filler: { REPLY: { fields: { can_do: FILLER } } },
    copyTarget: { artifact: 'REPLY', field: 'cannot_do' },
  },
  'MIS-CORE-REPLAN-01': {
    valid: {
      PLAN: { rows: [{ id: 'setup', owner: 'Me', change: 'Unchanged' }, { id: 'talk', owner: 'Priya', change: 'Moved to the end and shortened to ten minutes' }, { id: 'group', owner: 'Me', change: 'Starts at 9:45' }] },
      NOTE: { text: 'Priya, the part that breaks is Sam\'s short talk, since he is tied up until noon. My plan is to swap the talk with the group work and shorten it to ten minutes at the end, which costs us the discussion time we had planned after it. Could you step in and give the talk at 11:00 using Sam\'s slides, which are already in the shared folder?' },
    },
    paraphrase: {
      PLAN: { rows: [{ id: 'setup', owner: 'Me', change: 'Same' }, { id: 'talk', owner: 'Priya', change: 'Becomes a short wrap-up' }, { id: 'group', owner: 'Me', change: 'Runs first' }] },
      NOTE: { text: 'Sam\'s slot is the only one affected here, Priya, nothing else changes. Rather than the planned sequence, I will reorder things so the exercises happen first and Sam\'s talk shrinks to a brief wrap-up, which sacrifices some depth but protects the finish time. Would you be able to deliver that wrap-up at 11:10 from his slides?' },
    },
    filler: { NOTE: { text: FILLER } },
    copyTarget: { artifact: 'NOTE' },
  },
  'MIS-CORE-REPAIR-01': {
    valid: { CORRECTION: { text: 'That one is my mistake: the message I sent this morning said 10:00, when the room is actually booked for 9:30. Anyone who has already added the later slot to a calendar should move that entry back by half an hour, and tell colleagues who got a forwarded copy. In future the start time gets compared with the venue\'s written confirmation well ahead of any group message leaving my outbox.' } },
    paraphrase: { CORRECTION: { text: 'Apologies everyone, the earlier message was wrong and that was my error: we start at 9:30, not 10:00. Please correct any invite you created from that message and warn colleagues who are travelling that they need to be here half an hour earlier than they planned. To avoid this happening again, every future group message about timings gets read twice against the written booking by a second person before anybody presses send.' } },
    filler: { CORRECTION: { text: FILLER } },
    copyTarget: { artifact: 'CORRECTION' },
  },
  'MIS-CORE-USABLE-HANDOVER-01': {
    valid: {
      BOARD: { rows: [
        { id: 'slides', owner: 'Lea', done_when: 'Slide file is in the shared folder and Tom has opened it' },
        { id: 'room', owner: 'Lea', done_when: 'Booking confirmation email received and forwarded to Tom' },
        { id: 'projector', owner: 'Tom', done_when: 'Test slide shows on screen on Tuesday afternoon' },
        { id: 'visitors', owner: 'Tom', done_when: 'Visitor list with names sent to Lea by Wednesday 9:00' },
      ] },
      HANDOVER: { text: 'Tom cannot cover anything on Monday while he is travelling, so Lea takes the slides plus the room booking, both of which fall due that day. Tom picks up the projector on Tuesday afternoon and confirms the visitor list on Wednesday morning. Each task counts as finished only when something another person could see exists: the slide file sitting in the shared folder, a booking confirmation email, a test slide actually on screen, or a named visitor list delivered across.' },
    },
    paraphrase: {
      BOARD: { rows: [
        { id: 'slides', owner: 'Lea', done_when: 'Deck uploaded and Tom can open it' },
        { id: 'room', owner: 'Lea', done_when: 'Confirmation from the bookings desk in the inbox' },
        { id: 'projector', owner: 'Tom', done_when: 'Test run done, slide visible on the wall' },
        { id: 'visitors', owner: 'Tom', done_when: 'Named list emailed to Lea' },
      ] },
      HANDOVER: { text: 'Monday belongs to Lea for the slides and the room, as Tom is away that day and could not realistically touch either. The projector sits with Tom on Tuesday when the room is free, and he also closes out the visitor list first thing Wednesday. Finished means visible to somebody else: a deck uploaded where both can open it, a confirmation email from the bookings desk, a test slide glowing on the wall, or a complete visitor list emailed across to Lea.' },
    },
    filler: { HANDOVER: { text: FILLER } },
    missingOwner: {
      BOARD: { rows: [
        { id: 'slides', owner: 'Lea', done_when: 'Slide file is in the shared folder and Tom has opened it' },
        { id: 'room', owner: 'Lea', done_when: 'Booking confirmation email received and forwarded to Tom' },
        { id: 'projector', owner: null, done_when: 'Test slide shows on screen on Tuesday afternoon' },
        { id: 'visitors', owner: 'Tom', done_when: 'Visitor list with names sent to Lea by Wednesday 9:00' },
      ] },
      HANDOVER: { text: 'Lea takes the slides plus the room booking on Monday, and Tom confirms the visitor list on Wednesday morning. Each task counts as finished only when something another person could see exists: the slide file sitting in the shared folder, a booking confirmation email, or a named visitor list delivered across.' },
    },
    escalation: {
      BOARD: { rows: [
        { id: 'slides', owner: 'Lea', done_when: 'Slide file is in the shared folder and Tom has opened it' },
        { id: 'room', owner: 'Lea', done_when: 'Booking confirmation email received and forwarded to Tom' },
        { id: 'projector', owner: 'Escalate: Priya to decide', done_when: 'Priya names a tester by Monday noon and the test slide shows on screen' },
        { id: 'visitors', owner: 'Tom', done_when: 'Visitor list with names sent to Lea by Wednesday 9:00' },
      ] },
      HANDOVER: { text: 'Lea takes the slides plus the room booking on Monday, and Tom confirms the visitor list on Wednesday morning. I cannot assign the projector test to either of them, so I am escalating to Priya because nobody with Tuesday availability holds a key for that particular room. Each task counts as finished only when something another person could see exists: a file in the shared folder, a booking confirmation email, a test slide actually on screen, or a named list delivered across.' },
    },
    copyTarget: { artifact: 'HANDOVER' },
  },
  'MIS-CORE-NOT-TO-DO-01': {
    valid: {
      BOARD: { rows: [
        { id: 'room', order: 1, decision: 'DO - nothing else can be finalised without it' },
        { id: 'reminder', order: 2, decision: 'DO - needs the room details' },
        { id: 'badges', order: 3, decision: 'DO - visitors need them on arrival' },
        { id: 'form', order: 4, decision: 'DEFER - can be sent after the session' },
        { id: 'folder', order: 5, decision: 'HAND OFF - Sam, not needed before Friday' },
      ] },
      NOTE: { text: 'Confirming the venue has to happen before anything else, simply because the reminder message cannot be written until the room is nailed down. Badges come third since visitors need them on arrival. Two things slip: I will defer the feedback form until the week after, and Sam has agreed to tidy the folder since nobody opens it before Friday anyway.' },
    },
    paraphrase: {
      BOARD: { rows: [
        { id: 'room', order: 1, decision: 'DO - everything hangs on this' },
        { id: 'reminder', order: 2, decision: 'DO - once the room is known' },
        { id: 'badges', order: 3, decision: 'DO - needed at the door' },
        { id: 'form', order: 4, decision: 'DEFER - next week is fine' },
        { id: 'folder', order: 5, decision: 'HAND OFF - Sam offered' },
      ] },
      NOTE: { text: 'Room first, everything else second, because the reminder depends on the room details being final and I would rather not send it twice. Badges stay on the list for Friday morning. The feedback form can wait until the following week and the folder clean-up goes to Sam, who offered to take it.' },
    },
    filler: { NOTE: { text: FILLER } },
    escalation: {
      BOARD: { rows: [
        { id: 'room', order: 1, decision: 'DO - nothing else can be finalised without it' },
        { id: 'reminder', order: 2, decision: 'DO - needs the room details' },
        { id: 'badges', order: 3, decision: 'DO - visitors need them on arrival' },
        { id: 'form', order: 4, decision: 'DEFER - after the session' },
        { id: 'folder', order: 5, decision: 'ESCALATE - Priya to decide' },
      ] },
      NOTE: { text: 'Confirming the venue has to happen before anything else, simply because the reminder message cannot be written until the room is nailed down. I cannot assign the folder tidy to anyone this week, so I am escalating to Priya because she decides what the visitor actually needs to see.' },
    },
    copyTarget: { artifact: 'NOTE' },
  },
}
