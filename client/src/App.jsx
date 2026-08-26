import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth.jsx";
import { NotificationsProvider } from "./lib/notifications.jsx";
import { Loading } from "./components/Bits.jsx";
import Login from "./pages/Login.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Shell from "./components/Shell.jsx";
import BankingDashboard from "./pages/BankingDashboard.jsx";
import Accounts from "./pages/Accounts.jsx";
import PipelineBoard from "./pages/PipelineBoard.jsx";
import Opportunities from "./pages/Opportunities.jsx";
import OpportunityDetail from "./pages/OpportunityDetail.jsx";
import Mandates from "./pages/Mandates.jsx";
import MandateDetail from "./pages/MandateDetail.jsx";
import ClosedProjects from "./pages/ClosedProjects.jsx";
import DealMeetings from "./pages/DealMeetings.jsx";
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

  return (
    <NotificationsProvider>
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/banking" replace />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/login" element={<Navigate to="/banking" replace />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/banking" element={<BankingDashboard />} />
        <Route path="/banking/accounts" element={<Accounts />} />
        <Route path="/banking/board" element={<PipelineBoard />} />
        <Route path="/banking/opportunities" element={<Opportunities />} />
        <Route
          path="/banking/opportunities/:id"
          element={<OpportunityDetail />}
        />
        <Route path="/banking/mandates" element={<Mandates />} />
        <Route path="/banking/mandates/:id" element={<MandateDetail />} />
        <Route path="/banking/closed" element={<ClosedProjects />} />
        <Route path="/banking/deal-meetings" element={<DealMeetings />} />
        <Route path="/institutional" element={<InstitutionalDashboard />} />
        <Route path="/institutional/movement" element={<DailyMovement />} />
        <Route path="/institutional/clients" element={<Institutions />} />
        <Route
          path="/institutional/clients/new"
          element={<InstitutionForm />}
        />
        <Route
          path="/institutional/clients/:id/edit"
          element={<InstitutionForm />}
        />
        <Route path="/institutional/reports" element={<Reports />} />
        <Route path="/institutional/brokerage" element={<Brokerage />} />
        <Route path="/internal" element={<InternalDashboard />} />
        <Route path="/internal/my-day" element={<MyDay />} />
        <Route path="/internal/assignments" element={<Assignments />} />
        <Route path="/internal/assignments/new" element={<AssignmentForm />} />
        <Route path="/internal/assignments/:id" element={<AssignmentDetail />} />
        <Route path="/internal/kanban" element={<Kanban />} />
        <Route path="/internal/workload" element={<Workload />} />
        <Route path="/internal/timelog" element={<TimeLog />} />
        <Route path="/internal/meetings" element={<Meetings />} />
        <Route path="/internal/calendar" element={<CalendarPage />} />
        <Route path="/internal/emails" element={<Emails />} />
        <Route path="/internal/work-approvals" element={<WorkApprovals />} />
        <Route path="/masters" element={<Masters />} />
        <Route path="/users" element={<Users />} />
        <Route path="/departments" element={<Departments />} />
        <Route path="/data-backup" element={<DataBackup />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotBuilt />} />
      </Routes>
    </Shell>
    </NotificationsProvider>
  );
}
