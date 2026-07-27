import { useLocation, Link } from 'react-router-dom';
import { Card } from '../components/Bits.jsx';

/**
 * Honest placeholder. The API for these already exists — it is the screen
 * that has not been ported from the prototype yet.
 */
export default function NotBuilt() {
  const { pathname } = useLocation();
  return (
    <Card title="Not ported yet">
      <p style={{ fontSize: 13.5 }}>
        <span className="mono">{pathname}</span> is not one of the screens carried over in this first
        pass. The endpoint behind it exists — see <span className="mono">docs/PORTING.md</span> for the
        list and what each one needs.
      </p>
      <Link className="btn primary" to="/banking">Back to the dashboard</Link>
    </Card>
  );
}
