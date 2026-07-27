import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { Loading } from './components/Bits.jsx';
import Login from './pages/Login.jsx';
import Shell from './components/Shell.jsx';
import BankingDashboard from './pages/BankingDashboard.jsx';
import Opportunities from './pages/Opportunities.jsx';
import OpportunityDetail from './pages/OpportunityDetail.jsx';
import Institutions from './pages/Institutions.jsx';
import InstitutionForm from './pages/InstitutionForm.jsx';
import Brokerage from './pages/Brokerage.jsx';
import Assignments from './pages/Assignments.jsx';
import WorkApprovals from './pages/WorkApprovals.jsx';
import Masters from './pages/Masters.jsx';
import Users from './pages/Users.jsx';
import NotBuilt from './pages/NotBuilt.jsx';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Login />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/banking" replace />} />
        <Route path="/banking" element={<BankingDashboard />} />
        <Route path="/banking/opportunities" element={<Opportunities />} />
        <Route path="/banking/opportunities/:id" element={<OpportunityDetail />} />
        <Route path="/institutional/clients" element={<Institutions />} />
        <Route path="/institutional/clients/new" element={<InstitutionForm />} />
        <Route path="/institutional/clients/:id/edit" element={<InstitutionForm />} />
        <Route path="/institutional/brokerage" element={<Brokerage />} />
        <Route path="/internal/assignments" element={<Assignments />} />
        <Route path="/internal/work-approvals" element={<WorkApprovals />} />
        <Route path="/masters" element={<Masters />} />
        <Route path="/users" element={<Users />} />
        <Route path="*" element={<NotBuilt />} />
      </Routes>
    </Shell>
  );
}
