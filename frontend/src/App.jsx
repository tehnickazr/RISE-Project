import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { needsAcknowledgement } from './content/notice.js';
import Login from './pages/Login.jsx';
import RegisterInvite from './pages/RegisterInvite.jsx';
import SelectLanguage from './pages/SelectLanguage.jsx';
import StudentDashboard from './pages/StudentDashboard.jsx';
import TeacherDashboard from './pages/TeacherDashboard.jsx';
import TeacherStudent from './pages/TeacherStudent.jsx';
import Account from './pages/Account.jsx';
import PrivacyNotice from './pages/PrivacyNotice.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import TeacherContent from './pages/TeacherContent.jsx';
import TeacherContentScenario from './pages/TeacherContentScenario.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import PlatformDashboard from './pages/PlatformDashboard.jsx';
import InterviewSession from './pages/InterviewSession.jsx';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.preferred_language) return <Navigate to="/select-language" replace />;
  if (user.role === 'student') return <Navigate to="/student" replace />;
  if (user.role === 'teacher') return <Navigate to="/teacher" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'super_admin') return <Navigate to="/platform" replace />;
  return null;
}

function RequireAuth({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  if (needsNotice(user)) return <Navigate to="/privacy/read" replace />;
  return children;
}

/**
 * Has this person seen the current privacy notice?
 *
 * The notice page has always claimed, in its own final section, that a changed
 * notice appears at the next sign-in. Until 3 September 2026 that was not true
 * of anything: acceptance was recorded once at registration and no later
 * version ever reached anyone. Article 13 is not discharged by a document
 * nobody is shown.
 *
 * A null stamp and a stamp older than the last *material* version are treated
 * the same, because they mean the same thing to the reader: there is something
 * here they have not been shown. Null covers the seeded accounts, which predate
 * the mechanism.
 *
 * Not every version stops people. The rule lives in content/notice.js beside
 * the version numbers it reasons about — a text edit that fills in blanks the
 * notice already promised is not worth interrupting somebody for, and
 * interrupting them for it is how people learn to click through a privacy
 * notice without reading it.
 *
 * Staff are included. The staff notice is a different document with its own
 * subject matter — what the platform records about *them* — and it carries the
 * same version number for exactly this reason.
 */
function needsNotice(user) {
  return !!user && needsAcknowledgement(user.notice_version);
}

/**
 * Signed in, without the notice check.
 *
 * The notice page itself cannot use `RequireAuth`: that would redirect to the
 * notice, from the notice, forever.
 */
function RequireAuthOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Both public and both deliberately outside RequireAuth: the whole
            population of these pages is people who cannot sign in. */}
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route path="/reset" element={<ResetPassword />} />
        {/* Public: reachable from the sign-up screen, before any account exists.
            The invitation's language is passed in the path for that reason. */}
        <Route path="/privacy" element={<PrivacyNotice />} />
        {/* `/privacy/read` is the same page reached through the gate above, and
            it is deliberately a distinct path rather than a query string: it is
            the only route where the page must show a confirm button and must
            not offer a way back into an app the reader has not been informed
            about. Declared before `/privacy/:lang` so it is not read as one. */}
        <Route
          path="/privacy/read"
          element={
            <RequireAuthOnly>
              <PrivacyNotice mustAcknowledge />
            </RequireAuthOnly>
          }
        />
        <Route path="/privacy/:lang" element={<PrivacyNotice />} />
        <Route path="/register" element={<RegisterInvite />} />
        <Route
          path="/select-language"
          // Deliberately not behind the notice gate: choosing a language comes
          // first, so the notice is then read in it. The reverse order would
          // show a privacy notice in a language the reader has not yet claimed.
          element={
            <RequireAuthOnly>
              <SelectLanguage />
            </RequireAuthOnly>
          }
        />
        <Route
          path="/student/sessions/:id"
          element={
            <RequireAuth role="student">
              <InterviewSession />
            </RequireAuth>
          }
        />
        <Route
          path="/student/*"
          element={
            <RequireAuth role="student">
              <StudentDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/sessions/:id"
          element={
            <RequireAuth role="teacher">
              <InterviewSession />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/content/:id"
          element={
            <RequireAuth role="teacher">
              <TeacherContentScenario />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/content"
          element={
            <RequireAuth role="teacher">
              <TeacherContent />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/students/:id"
          element={
            <RequireAuth role="teacher">
              <TeacherStudent />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/*"
          element={
            <RequireAuth role="teacher">
              <TeacherDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/*"
          element={
            <RequireAuth role="admin">
              <AdminDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/platform/*"
          element={
            <RequireAuth role="super_admin">
              <PlatformDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/account"
          element={
            <RequireAuth>
              <Account />
            </RequireAuth>
          }
        />
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
