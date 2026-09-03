import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth.jsx";
import { NotificationsProvider } from "./lib/notifications.jsx";
import { Loading } from "./components/Bits.jsx";
import Login from "./pages/Login.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import ForcePassword from "./pages/ForcePassword.jsx";
import { allowedSegments, homePath } from "./lib/segments.js";
import Shell from "./components/Shell.jsx";
import BankingDashboard from "./pages/BankingDashboard.jsx";
import Accounts from "./pages/Accounts.jsx";
import AccountDetail from "./pages/AccountDetail.jsx";
import PipelineBoard from "./pages/PipelineBoard.jsx";
import Opportunities from "./pages/Opportunities.jsx";
import OpportunityDetail from "./pages/OpportunityDetail.jsx";
import Mandates from "./pages/Mandates.jsx";
import MandateDetail from "./pages/MandateDetail.jsx";
import ClosedProjects from "./pages/ClosedProjects.jsx";
import DealMeetings from "./pages/DealMeetings.jsx";
import BankingReports from "./pages/BankingReports.jsx";
import Institutions from "./pages/Institutions.jsx";
import InstitutionForm from "./pages/InstitutionForm.jsx";
import InstitutionalDashboard from "./pages/InstitutionalDashboard.jsx";
import DailyMovement from "./pages/DailyMovement.jsx";
import Reports from "./pages/Reports.jsx";
import Brokerage from "./pages/Brokerage.jsx";
import InternalDashboard from "./pages/InternalDashboard.jsx";
import MyDay from "./pages/MyDay.jsx";
import Assignments from "./pages/Assignments.jsx";
import AssignmentForm from "./pages/AssignmentForm.jsx";
import AssignmentDetail from "./pages/AssignmentDetail.jsx";
import Kanban from "./pages/Kanban.jsx";
import Workload from "./pages/Workload.jsx";
import TimeLog from "./pages/TimeLog.jsx";
import Meetings from "./pages/Meetings.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import Emails from "./pages/Emails.jsx";
import WorkApprovals from "./pages/WorkApprovals.jsx";
import Masters from "./pages/Masters.jsx";
import Users from "./pages/Users.jsx";
import Departments from "./pages/Departments.jsx";
import DataBackup from "./pages/DataBackup.jsx";
import Settings from "./pages/Settings.jsx";
import Notifications from "./pages/Notifications.jsx";
import NotBuilt from "./pages/NotBuilt.jsx";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <Loading />;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Bulk-imported users must replace their temporary password before they can
  // use anything else. This gate stays until the flag is cleared server-side.
  if (user.must_change_password) return <ForcePassword user={user} />;

  // The Masters module (Users & rights, Category & project, Departments,
  // Data & backup, Settings) is reachable only by Level 1 & 2. Anyone else who
  // reaches these routes by URL is bounced to their workspace home. This mirrors
  // the backend RequireLevel(2) gate so it is not merely a hidden menu.
  const mastersOk = (user?.level ?? 99) <= 2;

  // Department-based module visibility. seg() renders a page only if the user's
  // department is allowed that segment, otherwise bounces them to their own home
  // workspace — mirroring the backend so hidden modules can't be opened by URL.
  const segs = allowedSegments(user);
  const home = homePath(user);
  const seg = (s, el) => (segs.has(s) ? el : <Navigate to={home} replace />);

  return (
    <NotificationsProvider>
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/login" element={<Navigate to={home} replace />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/banking" element={seg('banking', <BankingDashboard />)} />
        <Route path="/banking/accounts" element={seg('banking', <Accounts />)} />
        <Route path="/banking/accounts/:id" element={seg('banking', <AccountDetail />)} />
        <Route path="/banking/board" element={seg('banking', <PipelineBoard />)} />
        <Route path="/banking/opportunities" element={seg('banking', <Opportunities />)} />
        <Route
          path="/banking/opportunities/:id"
          element={seg('banking', <OpportunityDetail />)}
        />
        <Route path="/banking/mandates" element={seg('banking', <Mandates />)} />
        <Route path="/banking/mandates/:id" element={seg('banking', <MandateDetail />)} />
        <Route path="/banking/closed" element={seg('banking', <ClosedProjects />)} />
        <Route path="/banking/deal-meetings" element={seg('banking', <DealMeetings />)} />
        <Route path="/banking/reports" element={seg('banking', <BankingReports />)} />
        <Route path="/institutional" element={seg('institutional', <InstitutionalDashboard />)} />
        <Route path="/institutional/movement" element={seg('institutional', <DailyMovement />)} />
        <Route path="/institutional/clients" element={seg('institutional', <Institutions />)} />
        <Route
          path="/institutional/clients/new"
          element={seg('institutional', <InstitutionForm />)}
        />
        <Route
          path="/institutional/clients/:id/edit"
          element={seg('institutional', <InstitutionForm />)}
        />
        <Route path="/institutional/reports" element={seg('institutional', <Reports />)} />
        <Route path="/institutional/brokerage" element={seg('institutional', <Brokerage />)} />
        <Route path="/internal" element={seg('internal', <InternalDashboard />)} />
        <Route path="/internal/my-day" element={seg('internal', <MyDay />)} />
        <Route path="/internal/assignments" element={seg('internal', <Assignments />)} />
        <Route path="/internal/assignments/new" element={seg('internal', <AssignmentForm />)} />
        <Route path="/internal/assignments/:id" element={seg('internal', <AssignmentDetail />)} />
        <Route path="/internal/kanban" element={seg('internal', <Kanban />)} />
        <Route path="/internal/workload" element={seg('internal', <Workload />)} />
        <Route path="/internal/timelog" element={seg('internal', <TimeLog />)} />
        <Route path="/internal/meetings" element={seg('internal', <Meetings />)} />
        <Route path="/internal/calendar" element={seg('internal', <CalendarPage />)} />
        <Route path="/internal/emails" element={seg('internal', <Emails />)} />
        <Route path="/internal/work-approvals" element={seg('internal', <WorkApprovals />)} />
        <Route path="/masters" element={mastersOk ? <Masters /> : <Navigate to="/" replace />} />
        <Route path="/users" element={mastersOk ? <Users /> : <Navigate to="/" replace />} />
        <Route path="/departments" element={mastersOk ? <Departments /> : <Navigate to="/" replace />} />
        <Route path="/data-backup" element={mastersOk ? <DataBackup /> : <Navigate to="/" replace />} />
        <Route path="/settings" element={mastersOk ? <Settings /> : <Navigate to="/" replace />} />
        <Route path="*" element={<NotBuilt />} />
      </Routes>
    </Shell>
    </NotificationsProvider>
  );
}
