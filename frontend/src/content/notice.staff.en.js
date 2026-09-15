// Privacy notice for teachers, career counsellors and administrators.
//
// Not a variant of the student notice — a different one. The student notice is
// about interview answers written by a minor; almost none of that applies to a
// member of staff, and the thing that does apply to staff and not to students
// is that **the platform records what they look at**. Reusing the student text
// would have buried the only paragraph that matters to this reader.
//
// English only for now, and that is a decision rather than an omission: staff
// are adults working on an English-language Erasmus+ project, and Article 12's
// child-appropriate wording requirement does not apply to them. If a French or
// Portuguese colleague would rather read it in their own language, the
// mechanism already supports it — see ./notice.js.

export const notice = {
  title: 'Your data as a member of staff',
  backLabel: '← Back',
  fullBelow: '↓ The full version is below.',
  schoolBlockLabel: 'To be completed by your school',

  headline:
    'This is about your own data as a teacher or administrator. Your students have a separate notice.',

  short: [
    {
      key: 'about-you',
      bold: 'What we hold about you:',
      text: 'your name, your work email address, your role and your language. Nothing else.',
    },
    {
      key: 'logged',
      warn: true,
      bold: 'Every time you open a student’s answers, that is recorded.',
      text: 'Who, which student, and when — never what you read. This exists so the school can answer a parent asking who saw their child’s work.',
    },
    {
      key: 'not-monitoring',
      bold: 'This is not performance monitoring.',
      text: 'The record is not used to assess you, and nobody reviews it as a matter of routine. It is there to be looked at when someone asks a question about a student’s data.',
    },
    {
      key: 'students',
      bold: 'You can see your own students, and only them.',
      text: 'Answers are candid because students were told their school would coach them on the strength of it.',
    },
    {
      key: 'rights',
      bold: 'You have the same rights as anyone else',
      text: '— to see what we hold about you, correct it, or have it deleted. Ask your school administrator, or use your account page.',
    },
  ],

  shortSchoolBlock:
    'We are <school>. Questions about your data go to <data protection officer>. We keep access records for 12 months.',

  sections: [
    {
      id: 'who',
      heading: '1. Who is responsible for your data',
      school:
        "The data controller is <school's full legal name, address, registration>. Our data protection officer is <name, email, phone>.",
      body: [
        'The platform is operated on the school’s behalf by **Tehnička škola Zrenjanin** (Serbia), which runs it for all three partner schools under a written agreement.',
      ],
    },
    {
      id: 'why',
      heading: '2. Why we hold data about you',
      listIntro: 'Two reasons, and they are different from each other:',
      list: [
        '**To give you an account** so you can sign in, coach your students and see their progress.',
        '**To be able to show who accessed a student’s records.** The students on this platform are mostly minors writing candidly about their working lives. A school that cannot say who read a particular student’s answers cannot answer the one question a parent or a supervisory authority will ask.',
      ],
      school: 'Our legal basis is <Article 6(1)(e) public task / Article 6(1)(b) contract / other>.',
    },
    {
      id: 'what',
      heading: '3. What we hold',
      table: [
        ['Your account', 'Your name, work email address, role and language.'],
        [
          'Access records',
          'One row each time you open a student’s interview, open a student’s progress page, view a class roster, export someone’s data, or delete an account.',
        ],
        [
          'What each row contains',
          'Your identity, the action, which student, and the time. **Never the content** — not their answers, not their scores, not the feedback.',
        ],
      ],
      after: [
        'The platform holds no interview answers written by you, because staff do not take practice interviews. If you sit one to try the tool, that session is treated exactly like a student’s.',
      ],
    },
    {
      id: 'logging',
      heading: '4. About the access records',
      body: [
        'This is the part of this notice worth reading properly, because it is the part that is genuinely about you.',
        '**What is recorded.** That you opened something, and whose it was. A roster view is recorded once with a count, not once per student in it. Opening your own account is not recorded.',
        '**What is not recorded.** The content of anything you read. Your IP address. Your browser. Where you were.',
        '**Who can read it.** Administrators and the data protection officer. **Not other teachers**, and not the students themselves as a matter of course.',
        '**What it is not for.** It is not a productivity measure, it is not reviewed periodically, and it is not part of any assessment of your work. It is consulted when there is a question about a particular student’s data.',
      ],
      callout:
        'If you would rather not have an access recorded, the answer is not to open the record — not to ask for the log to be off.',
    },
    {
      id: 'students',
      heading: '5. What you can see, and what is expected',
      list: [
        'You can see the students at **your own school**, not those at the other partner schools.',
        'Open a student’s answers when you are going to coach them on it. Curiosity is not a purpose.',
        'Students were told their answers stay inside their school. That promise is kept by people, not by software.',
        '**Nothing on this platform contributes to a student’s marks** — not their scores, not the AI’s comments. If that ever changes, the whole basis for holding this data changes with it.',
      ],
    },
    {
      id: 'helpers',
      heading: '6. Where your data is held',
      table: [
        ['Hostinger', 'Servers, database, and account and invitation email — Frankfurt, Germany (EU)'],
        ['Scaleway', 'The AI model — Paris, France (EU). It never receives your data, only student answers.'],
      ],
    },
    {
      id: 'serbia',
      heading: '7. Serbia',
      body: [
        'The platform is operated from Serbia, which is outside the European Union and has not been given an “adequacy decision” by the European Commission. Serbian data protection law is closely modelled on the GDPR.',
      ],
      school:
        'EU schools only — and only once the clauses are signed: transfers of your data to the operator in Serbia are protected by Standard Contractual Clauses approved by the European Commission, together with an assessment of the risks. You can ask us for a copy.',
    },
    {
      id: 'how-long',
      heading: '8. How long we keep it',
      table: [
        ['Your account', 'For as long as you work with the platform, and <period> after.'],
        ['Access records', '12 months, then deleted.'],
      ],
      after: [
        'Backups are overwritten within **90 days** and are only ever used to restore the service after a failure.',
        'One exception worth stating plainly: **your access records are kept even if you ask for your data to be deleted**, until their 12 months are up. Deleting them would destroy the record of who accessed a student’s data, which is not yours alone to erase. This relies on Article 17(3)(b).',
      ],
      school: 'We keep your account for <period> after you stop using the platform.',
    },
    {
      id: 'rights',
      heading: '9. Your rights',
      listIntro: 'You can ask to:',
      list: [
        '**see** everything we hold about you, including your access records;',
        '**correct** anything that is wrong;',
        '**delete** your data, subject to the exception in section 8;',
        '**limit** or **object to** what we do with it.',
      ],
      after: ['Use the buttons on your account page, or write to your school administrator.'],
      school:
        'Or write directly to <data protection officer>. We answer within one month. If you are not happy with how we handled it, you can complain to <supervisory authority>.',
    },
    {
      id: 'changes',
      heading: '10. Changes to this notice',
      body: [
        'If we change something important, you will see the new version the next time you sign in. Every version is dated, and we record which one you were shown.',
      ],
    },
  ],

  useHeading: 'Using the platform',
  useIntro:
    'These are your school’s expectations of staff. They are not a contract — they are how the tool is meant to be used.',
  useRules: [
    'Don’t share your login, and don’t look at a student’s answers on a screen anyone else can read.',
    'Open a student’s record when you have a reason to. Every one of those is recorded.',
    'Don’t repeat what a student wrote to anyone who would not otherwise see it.',
    'Nothing here counts towards a student’s marks. Don’t let it.',
  ],
};
