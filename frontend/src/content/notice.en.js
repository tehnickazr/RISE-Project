// English privacy notice, version 1.0. See ./notice.js for the versioning rule.
//
// `school` blocks are placeholders until each organisation supplies its own —
// controller identity, DPO, legal basis, retention, supervisory authority. They
// render visibly unfinished on purpose, so nothing ships half-filled.

export const notice = {
  title: 'Your practice interviews and your privacy',
  backLabel: '← Back',
  fullBelow: '↓ The full version is below.',
  schoolBlockLabel: 'To be completed by your school',

  headline:
    'RISE is a place to practise job interviews. It has nothing to do with your marks at school.',

  short: [
    { key: 'keep', bold: 'What we keep:', text: 'the answers you type, the score and feedback the AI gives them, and which interviews you did and when.' },
    { key: 'grades', bold: 'Nothing here affects your grades.', text: 'Not your marks, not your progression, not your work placement, not a report to your parents. Your teacher uses it to help you practise, and that is all it is ever used for.' },
    { key: 'teacher', bold: 'Your teacher can read your answers.', text: 'They are your coach here. Nobody outside your school can see them.' },
    { key: 'ai', bold: 'An AI reads and scores your answers.', text: 'It runs on computers in Paris. It is sometimes wrong, and its score is only ever a suggestion to try again.' },
    { key: 'careful', warn: true, bold: 'One thing to remember:', text: "write about the work, not about yourself or other people. You don't need to mention your health, your family, your religion or anyone's name to give a good interview answer." },
    { key: 'rights', bold: 'You can ask', text: 'to see everything the system holds about you, to have a mistake corrected, or to have it deleted — from your account page, or by asking your teacher.' },
  ],

  shortSchoolBlock:
    'We are <school>. Questions about your data go to <data protection officer>. We keep your answers for <period>.',

  sections: [
    {
      id: 'who',
      heading: '1. Who is responsible for your data',
      school: "The data controller is <school's full legal name, address, registration>. Our data protection officer is <name, email, phone>.",
      body: [
        'The platform is operated on the school’s behalf by **Tehnička škola Zrenjanin** (Serbia), which runs it for all three partner schools under a written agreement.',
      ],
    },
    {
      id: 'why',
      heading: '2. Why we process your data, and on what basis',
      body: [
        'RISE is part of the RISE project, funded by Erasmus+ (KA210-VET-778D8F70). It exists so that students in vocational education can practise a real job interview in their own trade and language, as many times as they want, and get useful feedback straight away.',
      ],
      callout: 'The purpose is to help you get hired after school. It is not to assess you within it.',
      listIntro: 'We use your data to:',
      list: [
        'run the practice interview and store what you wrote;',
        'produce a score and written feedback on each answer, and a summary at the end;',
        'let your teacher see your answers and progress so they can coach you;',
        'measure whether the project worked overall, for the report to Erasmus+ — using scores and numbers, not your written answers.',
      ],
      school: 'Our legal basis is <Article 6(1)(e) public task / other>.',
    },
    {
      id: 'not',
      heading: '3. What we do not do with it',
      list: [
        '**We do not use it to grade you.** No score, answer or AI comment contributes to a mark, a progression decision, a work placement, a disciplinary matter, or a report to your parents.',
        'We do not sell it, and we do not use it for advertising.',
        'We do not use your answers to train the AI model.',
        'We do not give it to any employer, ever.',
      ],
      after: [
        'If a school ever wanted to use these scores as part of assessment, that would be a different activity requiring a fresh assessment and a new notice.',
      ],
    },
    {
      id: 'what',
      heading: '4. What we hold',
      table: [
        ['Your account', 'Your name, your school email address, your language and your role.'],
        ['Your interviews', 'Which scenario, which level, when you started and finished, which attempt.'],
        ['Your answers', 'Exactly what you typed.'],
        ['The AI’s feedback', 'Scores per criterion, an overall score, what you did well, what to improve, and a suggested better answer.'],
      ],
    },
    {
      id: 'dont',
      heading: '5. Please don’t type personal details',
      body: [
        'The system asks open questions like *“tell me about a difficult situation at work”*. Please answer about the work.',
        'You do not need to mention your health, your family, your religion, your origins, or the name of any real person to give a strong interview answer — and we would rather not hold that information. We do not ask for it and we have no reason to keep it.',
      ],
    },
    {
      id: 'voice',
      heading: '6. Speaking your answer instead of typing it',
      body: [
        'If you prefer, you can speak your answer instead of typing it. This is entirely your choice — the microphone is only ever on while you hold the button open, and typing works exactly as it did before.',
        'When you use it, the recording goes to **Scaleway in Paris** — the same company that runs the AI, inside the European Union — which turns it into text and sends the text back. **The recording itself is never saved.** It is not kept on our servers, not stored anywhere by us, and never given to your teacher. What is saved is the text, and only after you have seen it.',
        'The text appears in the answer box for you to check. It will sometimes get a word wrong, especially a technical one. **Correct it before you send it** — what you submit is what gets scored, not what you said.',
      ],
    },
    {
      id: 'who-sees',
      heading: '7. Who can see your answers',
      list: [
        '**You.**',
        '**Teachers and career counsellors at your own school.** Not teachers at the other partner schools.',
        '**The people who run the platform**, only where they must in order to keep it working or to fix a fault.',
      ],
      after: ['Every time a member of staff opens your answers, that is recorded — who, and when.'],
    },
    {
      id: 'helpers',
      heading: '8. Companies that help run the service',
      table: [
        ['Scaleway', 'Runs the AI model that reads and scores your answers, and turns speech into text if you choose to dictate — Paris, France (EU)'],
        ['Hostinger', 'Runs the servers that store the data, and sends account emails — Frankfurt, Germany (EU)'],
      ],
      after: [
        'Your answers are processed **inside the European Union**. The AI model runs in Paris and the database is in Frankfurt.',
      ],
    },
    {
      id: 'serbia',
      heading: '9. Serbia',
      body: [
        'The platform is operated from Serbia, which is outside the European Union and has not been given an “adequacy decision” by the European Commission. Serbian data protection law is closely modelled on the GDPR.',
      ],
      school: 'EU schools only — and only once the clauses are signed: transfers of your data to the operator in Serbia are protected by Standard Contractual Clauses approved by the European Commission, together with an assessment of the risks. You can ask us for a copy.',
    },
    {
      id: 'ai',
      heading: '10. About the AI',
      body: [
        'An artificial intelligence model reads your answer, compares it with the points a complete answer should contain, and produces a score and written feedback.',
        '**It is often useful, and it is sometimes wrong.** It can miss a good point or misjudge how you expressed something. Its scores are not comparable between different trades, because the reference answers were written by different people.',
        'This is why nothing it produces counts for anything: it is there to give you something to react to, not to judge you. If you think a score is unfair, tell your teacher — they can look at your answer with you.',
      ],
    },
    {
      id: 'how-long',
      heading: '11. How long we keep it',
      school: 'We keep your written answers and the AI’s feedback for <period> after you finish an interview, and then delete them. Scores without your answers are kept until the project’s final report is complete, after which they are anonymised. Your account is closed at the end of the year and deleted <period> later.',
      body: [
        'When something is deleted it is removed from the live system straight away. Copies in our backups are overwritten within **90 days**, and are only ever used to restore the service after a failure.',
        'One exception: the record of *who looked at* your data is kept for 12 months even if you ask us to delete everything else. Deleting it would destroy the evidence of who had access — which is usually the thing people want to know.',
      ],
    },
    {
      id: 'rights',
      heading: '12. Your rights',
      listIntro: 'You can ask to:',
      list: [
        '**see** everything the system holds about you, and get a copy;',
        '**correct** anything that is wrong;',
        '**delete** your data;',
        '**limit** or **object to** what we do with it.',
      ],
      after: ['Use the buttons on your account page, or ask your teacher.'],
      school: 'Or write directly to <data protection officer>. We answer within one month. If you are not happy with how we handled it, you can complain to <supervisory authority>.',
      afterSchool: [
        'Sometimes we may not be able to delete everything immediately — for example where the school is required to keep certain records. If that happens we will tell you which part, and why.',
      ],
    },
    {
      id: 'must',
      heading: '13. Do you have to use it?',
      body: [
        'No. The practice interviews are not part of your coursework, and choosing not to use the platform has no academic consequence of any kind.',
        'You are never obliged to write about anything personal. A short answer about the work is a perfectly good answer.',
      ],
    },
    {
      id: 'changes',
      heading: '14. Changes to this notice',
      body: [
        'If we change something important, you will see the new version the next time you sign in. Every version is dated, and we record which one you were shown.',
      ],
    },
  ],

  useHeading: 'Rules for using RISE',
  useIntro:
    'These are your school’s rules for the platform. They are not a contract, and there is nothing here to agree to — they are how the tool is meant to be used.',
  useRules: [
    'Don’t share your login with anyone.',
    'Write about the work. Don’t type personal details about yourself, and don’t type anyone else’s name or details.',
    'This is practice. The interviewer is a computer, not a real employer, and nothing you write here is sent to one.',
    'The feedback is meant to help. If it seems wrong or unfair, tell your teacher.',
  ],
};
