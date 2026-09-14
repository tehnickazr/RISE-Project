import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import { localized, normalizeLanguage, useT } from '../i18n/index.js';
import logo from '../assets/images/Logo_Rise.svg';
import SkillConstellation from '../components/SkillConstellation.jsx';
import DictateButton from '../components/DictateButton.jsx';
import { appendTranscript } from '../lib/dictation.js';

export default function InterviewSession() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const preferredLang = normalizeLanguage(user?.preferred_language);

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [latestFeedback, setLatestFeedback] = useState(null);
  const [latestFeedbackQuestion, setLatestFeedbackQuestion] = useState('');
  const [latestFeedbackType, setLatestFeedbackType] = useState(null);
  const feedbackRef = useRef(null);
  // Dictation state, kept here rather than in the button because both outlive
  // it: `dictated` travels with the submission, and the notice has to survive
  // the button returning to idle.
  const [dictationError, setDictationError] = useState(null);
  const [dictationNotice, setDictationNotice] = useState(null);
  const [usedDictation, setUsedDictation] = useState(false);
  // Submit steps aside while the microphone is open. An answer cannot be sent
  // while it is still being spoken, so leaving the button there put a third
  // control in a row that needs two — and on a phone that pushed the whole
  // group past the edge of the card.
  const [recording, setRecording] = useState(false);

  // The interview language comes from the loaded session, but hooks must run in
  // the same order on every render — and this component returns early while
  // data is still null. Derive the language defensively and call useT here, so
  // both calls happen before any early return.
  const lang = normalizeLanguage(data?.session?.language ?? preferredLang);
  const t = useT(lang);
  const chromeT = useT(preferredLang);

  const refresh = async () => {
    try {
      const fresh = await api.session(id);
      setData(fresh);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    refresh();
  }, [id]);

  useEffect(() => {
    if (latestFeedback && feedbackRef.current) {
      feedbackRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [latestFeedback]);

  // The server owns this number and publishes it; the fallback only matters
  // for the first render before the session payload arrives.
  const maxChars = data?.limits?.answer_max_chars ?? 4000;
  const showCount = answer.length >= maxChars * 0.75;
  const overLimit = answer.length > maxChars;

  const isTeacher = user?.role === 'teacher';
  // Where "back" goes. A teacher can reach this page from the interview list or
  // from one student's progress view, and being returned to the list from the
  // latter loses their place. The caller says where it came from; the dashboard
  // stays the fallback for a deep link or a refresh.
  const origin = location.state?.from;
  const dashHref = origin?.path ?? (isTeacher ? '/teacher' : '/student');
  const backLabel = origin?.label
    ? `${chromeT.common.backArrow} ${origin.label}`
    : chromeT.common.back;

  if (error) {
    return (
      <main>
        <p>
          <button onClick={() => navigate(dashHref)}>{backLabel}</button>
        </p>
        <p className="error">{chromeT.common.error}: {error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main>
        <p>{chromeT.common.loading}</p>
      </main>
    );
  }

  const { session, scenario, history, next_question: next, summary, summary_pending: summaryPending } = data;
  const totalQuestions = scenario.questions.length;
  const answeredCount = history.length;
  const currentIndex = answeredCount + (next ? 1 : 0);
  const scenarioTitle = localized(scenario, 'title', lang);
  const statusText =
    session.status === 'completed'
      ? t.common.status.completed
      : session.status === 'in_progress'
      ? t.common.status.inProgress
      : session.status;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!next) return;
    setBusy(true);
    setError(null);
    const question = scenario.questions.find((q) => q.question_id === next.question_id);
    const answeredQuestionText = question ? localized(question, 'question', lang) : '';
    try {
      const result = await api.submitAnswer(id, next.question_id, answer, usedDictation);
      setLatestFeedback(result.feedback);
      setLatestFeedbackQuestion(answeredQuestionText);
      setLatestFeedbackType(question?.type ?? null);
      setAnswer('');
      // Per question, not per session: the next one starts typed until it isn't.
      setUsedDictation(false);
      setDictationNotice(null);
      setDictationError(null);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <header className="page-header session-header">
        <div className="brand-heading compact">
          <img src={logo} alt="RISE" />
          <button className="button ghost" onClick={() => navigate(dashHref)}>{backLabel}</button>
        </div>
      </header>
      <h1>{scenarioTitle}</h1>

      {isTeacher && (
        <p className="session-meta">
          {data.session.student_name && (
            <>
              <strong>{t.interview.studentLabel}:</strong> {data.session.student_name} ·{' '}
            </>
          )}
          <strong>{t.interview.statusLabel}:</strong> {statusText} ·{' '}
          <strong>{t.interview.questionN(answeredCount, totalQuestions)}</strong>
        </p>
      )}

      {next && !isTeacher && (
        <section className="question-card">
          <h2>{t.interview.questionN(currentIndex, totalQuestions)}</h2>
          <p className="question-text">
            {localized(next, 'question', lang)}
          </p>
          <form onSubmit={onSubmit} className="answer-form">
            <label>
              {t.interview.yourAnswer}
              {/* Deliberately no maxLength: it truncates a paste silently, and
                  the students most likely to prepare an answer elsewhere are
                  the ones the accommodation obligations name. Let them go over,
                  show them, and block submit instead — nothing is ever lost. */}
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={t.interview.answerPlaceholder}
                rows={6}
                required
                disabled={busy}
                aria-describedby="answer-help"
              />
            </label>
            {/* One line, three states. The counter stays hidden until the
                length is actually relevant: a permanent "0 / 4000" reads as a
                target, and length buys nothing here — terse and verbose answers
                score the same. */}
            <p
              id="answer-help"
              className={`answer-help${overLimit ? ' is-over' : ''}`}
            >
              {overLimit
                ? t.interview.answerTooLong.replace('{max}', maxChars.toLocaleString(lang))
                : showCount
                  ? t.interview.answerCount
                      .replace('{n}', answer.length.toLocaleString(lang))
                      .replace('{max}', maxChars.toLocaleString(lang))
                  : t.interview.answerHint}
            </p>
            {/* A transcript is a draft, never a submission. Answers are scored
                against expected answers full of specific technical terms, and
                trade vocabulary is exactly where transcription fails — so the
                student reads and corrects their own words before anything is
                sent for scoring. */}
            {(dictationError || dictationNotice) && (
              <p className={`dictate-message${dictationError ? ' is-error' : ''}`} role="status">
                {dictationError ?? dictationNotice}
              </p>
            )}
            <div className={`answer-submit-row${recording ? ' is-recording' : ''}`}>
              {!recording && (
                <button
                  type="submit"
                  disabled={busy || answer.trim().length === 0 || overLimit}
                >
                  {busy ? t.interview.submitting : t.interview.submit}
                </button>
              )}
              <DictateButton
                onRecordingChange={setRecording}
                sessionId={id}
                disabled={busy}
                t={t}
                onError={(message) => {
                  setDictationError(message);
                  setDictationNotice(null);
                }}
                onTranscript={(text, { lowConfidence }) => {
                  setAnswer((current) => appendTranscript(current, text));
                  setUsedDictation(true);
                  setDictationError(null);
                  setDictationNotice(
                    lowConfidence ? t.interview.dictate.checkCarefully : t.interview.dictate.review
                  );
                }}
              />
              {busy && <SkillConstellation isActive />}
            </div>
          </form>
        </section>
      )}

      {next && isTeacher && (
        <section className="question-card">
          <h2>{t.interview.awaitingNext}</h2>
          <p className="question-text">
            Q{currentIndex}: {localized(next, 'question', lang)}
          </p>
        </section>
      )}

      {latestFeedback && next && !isTeacher && (
        <FeedbackPanel
          feedback={latestFeedback}
          rubrics={scenario.rubrics}
          lang={lang}
          t={t}
          questionText={latestFeedbackQuestion}
          questionType={latestFeedbackType}
          ref={feedbackRef}
        />
      )}

      {summary && (
        <section className="summary-card">
          <h2>{t.interview.finalSummary}</h2>
          <div className="overall-score">
            <span>{t.interview.overallScore}:</span>
            <strong>{summary.overall_score.toFixed(1)} / 5</strong>
          </div>
          <h3>{t.interview.strengths}</h3>
          <p>{summary.strengths}</p>
          <h3>{t.interview.improvements}</h3>
          <p>{summary.improvements}</p>
          <p className="encouragement">{summary.encouragement}</p>
        </section>
      )}

      {/* The interview is finished and scored — only the closing prose is
          missing, because that call failed. Reloading retries it, so say that
          rather than showing nothing and letting the page look truncated. */}
      {summaryPending && (
        <section className="summary-card is-pending">
          <h2>{t.interview.finalSummary}</h2>
          <p>{t.interview.summaryUnavailable}</p>
          {/* Only the student's own reload regenerates it — a teacher reviewing
              sessions should not be able to spend on a call per session opened,
              so they are told it is missing without being offered a button that
              would do nothing. */}
          {!isTeacher && (
            <button type="button" className="button ghost" onClick={refresh}>
              {t.interview.summaryRetry}
            </button>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section className="history-section">
          <h2>{t.interview.sessionAnswers}</h2>
          <ol className="history-list">
            {history.map((h, i) => (
              <li key={h.question_id} className="history-item">
                <strong>
                  Q{i + 1}: {localized(h, 'question', lang)}
                </strong>
                <details {...(isTeacher ? { open: true } : {})}>
                  <summary>
                    {isTeacher ? t.interview.studentAnswer : t.interview.yourAnswer} ·{' '}
                    {t.interview.overallScore}: {Number(h.overall_score).toFixed(1)}
                  </summary>
                  <p className="answer-quote">{h.answer}</p>
                  <FeedbackPanel
                    feedback={h.feedback}
                    rubrics={scenario.rubrics}
                    lang={lang}
                    t={t}
                    questionType={h.type}
                    compact
                  />
                </details>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}

/**
 * The name of a competency, in the reader's language.
 *
 * The scenario's own label first: it is written by whoever authored the
 * content, and it is often more specific than the generic term — one
 * mechatronics scenario calls `ethics` "Bezbednost i odgovornost", which is
 * what that trade actually means by it.
 *
 * Then the interface translation, for a competency the scenario has no rubric
 * row for. Then, only if both are missing, a readable form of the key — the
 * vocabulary is open and content authors introduce their own.
 */
function rubricLabel(rubrics, key, lang, t) {
  const r = (rubrics ?? []).find((x) => x.competency === key);
  const fromContent = r ? localized(r, 'label', lang) : '';
  if (fromContent) return fromContent;

  const fromInterface = t?.competency?.[key];
  if (fromInterface) return fromInterface;

  return String(key ?? '')
    .replace(/_/g, ' ')
    .replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}

const FeedbackPanel = function FeedbackPanel({
  feedback,
  rubrics,
  lang,
  t,
  questionText,
  questionType,
  compact,
  ref,
}) {
  // Revealed only here, never while the question is being answered — telling a
  // student in advance that the next one is a trap defeats the point of it.
  const typeLabel = questionType ? t.interview.questionType?.[questionType] : null;
  return (
    <section ref={ref} className={compact ? 'feedback-card compact' : 'feedback-card'}>
      {!compact && <h2>{t.interview.feedback}</h2>}
      {typeLabel && <p className={`question-type question-type-${questionType}`}>{typeLabel}</p>}
      {!compact && questionText && (
        <p className="feedback-question">
          <strong>{t.interview.feedbackQuestion}:</strong> {questionText}
        </p>
      )}
      <div className="overall-score">
        <span>{t.interview.overallScore}:</span>
        <strong>{feedback.overall_score.toFixed(1)} / 5</strong>
      </div>
      <h3>{t.interview.perCriterion}</h3>
      <ul className="criterion-list">
        {feedback.per_criterion.map((c) => (
          <li key={c.competency}>
            <strong>{rubricLabel(rubrics, c.competency, lang, t)}</strong> — {c.score.toFixed(1)} / 5
            <p>{c.comment}</p>
          </li>
        ))}
      </ul>
      <h3>{t.interview.strengths}</h3>
      <p>{feedback.strengths}</p>
      <h3>{t.interview.improvements}</h3>
      <p>{feedback.improvements}</p>
      <h3>{t.interview.improvedAnswer}</h3>
      <blockquote>{feedback.improved_answer}</blockquote>
    </section>
  );
};
