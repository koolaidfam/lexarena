/**
 * Reference material for the bench engine.
 *
 * Two curated, hand-cleaned corpora distilled from real advocacy sources:
 *   1. BENCH_EXCHANGES   — short oral-argument exchanges (US Supreme Court, 2025–26
 *                          term) chosen to model tone, interruptions, questioning
 *                          style, follow-up technique and judicial phrasing.
 *   2. ADVOCACY_PRINCIPLES — one-sentence fundamentals of oral appellate advocacy
 *                          (Chen Siyuan, "Advanced Fundamentals of Oral Appellate
 *                          Advocacy in a Moot Court" (2012) 30 Sing. L. Rev. 45).
 *
 * Used to flavour the bench's voice and to ground coaching feedback. Nothing here
 * is case-specific advice; it is style + craft reference only.
 */

/* ============================================================
 * 1) BENCH EXCHANGES — how a hot bench actually sounds
 * Each item: a technique label + a 5–20 line exchange.
 * ============================================================ */
export const BENCH_EXCHANGES = [
  {
    technique: 'Envelope-pushing hypothetical; counsel must bite the bullet',
    text:
`JUDGE: Let me give you a hypothetical and you tell me whether liability lies. Suppose a customer comes to you and says: I am addicted to infringing, I have been sued before, I know it is illegal, and you are my only option for service. If you sell to me knowing all of that, you still say no liability?
COUNSEL: That's correct, Your Honor. That's a difficult hypothetical that pushes the envelope.
JUDGE: That's the point of the hypothetical. (Laughter.)
COUNSEL: Understood. Let me underscore that the facts you recited would invite the plaintiffs to sue that infringer directly. They have recourse in that situation.`,
  },
  {
    technique: 'Judge builds a syllogism and asks counsel to find the flaw',
    text:
`JUDGE: Let me ask if I've got it right — the narrowest version of your argument, perhaps not everything you want. The statute doesn't mention secondary liability, so we should be cautious. The narrowest version requires purpose; knowledge isn't enough. The instructions here contained only knowledge. So, therefore, reverse. Anything wrong with that syllogism?
COUNSEL: There's nothing wrong with the syllogism. Just one quibble — we're not challenging the jury instructions; we're making a different argument. But yes, everything else you said I completely agree with.`,
  },
  {
    technique: 'Concession-seeking, then exposing the consequence',
    text:
`JUDGE: As I understand your argument, your client could be the worst corporate citizen of all time and it still wouldn't matter — there would be no liability. Is that right?
COUNSEL: That's correct.
JUDGE: Okay. But then what would the safe harbor provision mean? It would seem to do nothing. Why would anybody care about getting into the safe harbor if there's no liability in the first place?
COUNSEL: Well, Congress can adopt a safe harbor for all sorts of reasons —
JUDGE: You agree it would be doing nothing at all?
COUNSEL: Correct. Yes, I agree.`,
  },
  {
    technique: 'Analogy used to press; counsel resists the equation',
    text:
`JUDGE: If I'm a gun dealer and I sell to someone who says "I'm going to kill my wife with this gun," the common law would say you knew what he would do, you joined in. Why isn't your continuing to provide service the same when you know that location will keep infringing?
COUNSEL: Well, because, Your Honor, it needs to be an act that unequivocally demonstrates a purpose —
JUDGE: Why?
COUNSEL: — to foster the wrong, not the equivocal act of selling to everyone on equal terms.`,
  },
  {
    technique: 'Step-by-step march through concessions to corner the position',
    text:
`JUDGE: The interest being protected is the federal government's military interest, correct?
COUNSEL: Yes.
JUDGE: You only get liability if the state-law duty conflicts with military orders.
COUNSEL: Correct.
JUDGE: And so, if there's no conflict, there's no interest to protect, correct?
COUNSEL: There's nothing here, because the contractor violated what the military wanted it to do.
JUDGE: If the government had directed the conduct, there would be no liability, correct?
COUNSEL: Correct.`,
  },
  {
    technique: 'The "who wrote it?" trap — reductio against counsel\'s own premise',
    text:
`JUDGE: The thrust of your brief is that the decision is inconsistent with textualism. Did I read too much into it?
COUNSEL: No — our position is the Court need not overrule it because we win even under its terms.
JUDGE: Well, was it correctly decided? Who wrote it?
COUNSEL: Justice Scalia wrote it.
JUDGE: So you're saying the founding father of textualism doesn't understand textualism. (Laughter.)
COUNSEL: No, that's not what I'm saying at all, Your Honor.`,
  },
  {
    technique: 'Demanding the mechanism — "tell me why," not the conclusion',
    text:
`JUDGE: Help me figure out what the harm to the government actually is. Take the contractor who doesn't properly maintain the trucks, in violation of the government's own manual. Why would state liability be so injurious there?
COUNSEL: It changes the relationship between the parties. It alters the contractor's behaviour on the ground —
JUDGE: But tell me why.
COUNSEL: Because they become less willing to do risky things; they fall into a "mother, may I" dynamic, asking permission and building a record for some future jury.`,
  },
  {
    technique: 'Incremental pressure — the percentage ladder on a concession',
    text:
`JUDGE: On your theory you can infer intent only if the cause of action would otherwise be useless — zero percent of cases could proceed. You agree with that?
COUNSEL: I do.
JUDGE: But once we get to 99.9 percent eliminated, you say that same inference is unavailable?
COUNSEL: Because you can never know for certain it's 99.9.
JUDGE: Okay. How about 90 percent?
COUNSEL: That's exactly my point —
JUDGE: No, but you conceded 99.
COUNSEL: I said maybe.
JUDGE: Oh, maybe. All right. (Laughter.)`,
  },
  {
    technique: 'Narrowing to the question presented; refusing the rabbit holes',
    text:
`JUDGE: I don't want to get into any of that. You're advocating a bright-line rule, right? A delivery driver is in interstate commerce unless he neither crosses state borders himself nor interacts with a vehicle that does.
COUNSEL: Close — we'd say you bookend the transportation with loading and unloading.
JUDGE: I'm not interested in that. The question you asked us to decide is the bright-line rule. Yes or no — and we can be done with this case?
COUNSEL: Yes.
JUDGE: We don't need to get into title, control, or how long the goods sit in the warehouse?
COUNSEL: Correct.`,
  },
  {
    technique: 'Judge offers a competing frame and invites counsel to fight it',
    text:
`JUDGE: Whether or not your test is clear, it has a real arbitrariness. What you should be thinking about is that the manufacturer needs to get the bread from the factory to the supermarket. If the goods cross state lines, then everyone involved in moving them ought to fall in the same category — not be split up by the happenstance of which leg crossed a line.
COUNSEL: Respectfully, that's not the test. The cases ask what work the class of workers performs.
JUDGE: They're all driving the trucks that get your bread from the factory to the supermarket. That's what all of them are doing.`,
  },
  {
    technique: 'Hypothetical that isolates one variable to test the theory',
    text:
`JUDGE: Let's hold the worker constant. The goods stay in-state, but the vehicle came in this morning from another state. You're the worker loading that vehicle. Is that person in the interstate class?
COUNSEL: Under the rule, the leg begins at loading, so you wouldn't look at where the vehicle came from.
JUDGE: So you don't look at the vehicle at that point in the analysis?
COUNSEL: Because the question is when the cross-border transportation begins and ends.
JUDGE: Without regard to where the vehicle came from?
COUNSEL: Yes.
JUDGE: All right.`,
  },
  {
    technique: 'Redirecting an evasive answer — "you\'re not answering my question"',
    text:
`JUDGE: Aren't you worried a holding as broad as yours would be a disincentive for providers to give any aid at all? Why would they bother?
COUNSEL: Imagine a case where the individual was sued directly and a court fashioned an injunction —
JUDGE: I don't think you're answering my question.
COUNSEL: I —
JUDGE: What is left as any inducement for them to act in good faith?
COUNSEL: I would agree not much economic incentive would be left. I'm questioning whether that's a bad thing.`,
  },
  {
    technique: 'Pragmatic stare decisis pressure — "why not stick with what we said?"',
    text:
`JUDGE: Why not stick with what we said in the prior case and be done with it? There is already parallel litigation; why add to it unnecessarily? If we were writing on a blank slate, maybe your position would have more force, but given what we said, why disturb it?
COUNSEL: That issue wasn't directly presented in that case, so I don't think the sentence should be read as resolving it against us. The rest of the opinion's analysis supports our reading.`,
  },
  {
    technique: 'Testing a limiting principle to the point of absurdity',
    text:
`JUDGE: If we're going to limit the doctrine, it has to be on some rational basis. In the first case the name began with R; in the second, F. Here it begins with T. Can we really say we're not going any further than those two cases, so this one doesn't qualify?
COUNSEL: The earlier decision didn't go quite that far, but it made clear the doctrine is narrow and shouldn't extend beyond those facts.`,
  },
  {
    technique: 'Open-ended invitation — make your best case, briefly',
    text:
`JUDGE: Give me your best shot. I know it's in your brief and I know you don't want to lead with it, but I want to hear it. Sing a few bars for me.
COUNSEL: We think the doctrine is wrong: it's out of sync with how the Court now articulates jurisdictional rules. District courts must exercise the jurisdiction Congress gave them; the right place to look is the statutory text, and the text doesn't forbid them from acting.`,
  },
  {
    technique: 'Counsel correcting the judge\'s restatement; judge re-presses',
    text:
`COUNSEL: I disagree with the idea that Congress meant federal courts writ large can't adjudicate these rights.
JUDGE: That's not what I was saying. I'm saying Congress set up an order of operations — the state courts go first, and review comes at the end. Your rule lets collateral attacks happen all along the way. How is that consistent with the scheme?
COUNSEL: I think that inference asks more of the statute than it can bear. Jurisdictional rules must be clearly expressed, and this one says nothing about lower-court judgments.`,
  },
  {
    technique: 'Confident, plain-spoken advocate; rapport and economy',
    text:
`JUDGE: Could you speak to your friend's suggestion that, as a backup, we revisit the doctrine entirely?
COUNSEL: This is not the case for it. The words "egregiously wrong" don't even appear in their brief. If we were going to overrule precedent, you'd want the affected parties before you — and they aren't. So, respectfully, that's not happening in this posture.
JUDGE: Don't dare your colleagues. (Laughter.)`,
  },
  {
    technique: 'Locking down a definition before counsel can blur it',
    text:
`JUDGE: This word is going to be key, and it's slippery. I want to nail down what you mean. Mere knowledge alone cannot show purpose — purpose can't be inferred from knowledge alone. Correct?
COUNSEL: That is correct, with one caveat: it can be shown when the only use of the thing sold is an infringing use.
JUDGE: Assume substantial lawful uses. Then what is good enough to show purpose — state it clearly.
COUNSEL: Two things: inducement — words encouraging the wrong — and affirmative conduct directed at fostering it.`,
  },
  {
    technique: 'Blunt skepticism — "I find this extremely confusing"',
    text:
`JUDGE: I find your argument extremely confusing. Anybody who produces consumer goods intends the final destination to be the consumer, because unless the consumer pays, the producer makes no money. So I don't understand what it means to ask what the intended end point is.
COUNSEL: Let me try to clarify. The question isn't the end of the distribution chain; it's where the journey ended when the goods were shipped. When the shipper sent them to the retail stores, that was the end of that journey.`,
  },
  {
    technique: 'Reserving issues with rapport and humour',
    text:
`JUDGE: If you win, there's no need to resolve it. But if you lose, it's a question for another day?
COUNSEL: Exactly. And then maybe you'll see me here again in another year. (Laughter.)
JUDGE: I'll look forward to it.`,
  },
];

/* ============================================================
 * 2) ADVOCACY PRINCIPLES — one idea per line
 * ============================================================ */
export const ADVOCACY_PRINCIPLES = [
  'A strong opening has up to four ingredients — recitation of facts, rhetoric, a roadmap, and the relief sought.',
  'The roadmap is indispensable: give the bench an overview of the issues and arguments without excessive detail.',
  'Keep the opening succinct — aim to reach your arguments proper within about a minute and a half of formalities and roadmap.',
  'Avoid theatrics; the best advocacy balances the clinical and the forceful.',
  'Master the three F\'s of argument: Fight (what is really contested), Focus (where to spend time), and Flag (signpost it clearly).',
  '"Fight" is identifying the spectrum of issues the other side and the bench will actually press — not every issue raised in brainstorming.',
  'Identify threshold issues early: lose one and it can have a fatal domino effect on everything that follows.',
  'Do not spend disproportionate time on issues that will not interest the bench.',
  'The more incredible the argument, the greater the authority required to support it.',
  'Use conventional structures (IRAC / CRUPAC): legal premise, factual premise, conclusion, counter-arguments, policy.',
  'Don\'t lecture on the law in the abstract — connect the legal proposition to the facts of the problem.',
  'Test every argument against three things: is it fair, is it reasonable, and is it logical?',
  'Persuasion happens on two levels at once: running your own case and addressing the bench\'s concerns.',
  'Welcome questions — silence is not acceptance, and a good answer reduces the chance of a long line of follow-ups.',
  'Never appear irritated or disrupted when a question is asked.',
  'Listen to the question extremely carefully; if it admits a yes/no, give the yes/no first, then explain.',
  'A simple question demands a simple answer; a difficult question demands a more considered one.',
  'Diagnose what the question seeks: law (run the authorities), application (run the facts), or fairness (run the principle).',
  'Layer your answer like an onion — don\'t give everything at once; read how expectant the bench is.',
  'Concede what cannot be defended, then re-anchor: "Your point is well taken, but —".',
  'After answering, bridge back to where you left off rather than waiting in silence.',
  'Never describe a question as irrelevant, a red herring, or unjustified.',
  'Don\'t dance around a hard question hoping to overwhelm the bench with ambiguity.',
  'The contest is usually won or lost in the most intense two or three minutes of question-and-answer.',
  'Try to control the bench without their knowing — word your submissions to invite questions in areas you have prepared.',
  'Never ask permission to move on; just move on, unless the bench stops you.',
  'Wean yourself off a script — reliance on one makes you look unprepared and insincere.',
  'Distinguish a hypothetical on its facts, showing why a change in facts changes the legal or policy result.',
  'Keep eye contact with the whole bench; recognise a bailout question from a quiet judge and accept the help.',
  'A good advocate is like a good salesperson: persuade without being pushy, and never pretend your case has no limits.',
  '"Do not moot the last moot" — don\'t demolish a sound case theory because one panel had a bad reaction.',
  'End on a high note: a conclusion should add impetus to your side, not merely summarise neutrally.',
  'In rebuttal, state how many points you will make, go straight to each, and repair the most badly damaged part of your case.',
  'Rebuttal is not the occasion to summarise, rehash an argument already made, or raise something new.',
  'Appellate advocacy is largely about credibility — convince the bench you know the material without seeming inflexible.',
  'Above all: listen carefully to the question, and answer it directly and convincingly.',
];

/* ============================================================
 * Helpers
 * ============================================================ */

// A compact style digest for seeding a bench persona prompt.
export function benchStyleDigest(limit = 6) {
  return BENCH_EXCHANGES.slice(0, limit)
    .map((e, i) => `(${i + 1}) [${e.technique}]\n${e.text}`)
    .join('\n\n');
}

// Principles as a single bulleted block for coaching prompts.
export function principlesText(limit = ADVOCACY_PRINCIPLES.length) {
  return ADVOCACY_PRINCIPLES.slice(0, limit).map((p) => `- ${p}`).join('\n');
}
