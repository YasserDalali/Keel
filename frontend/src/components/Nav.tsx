import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import Badge from "./ui/Badge";
import Button from "./ui/Button";

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <nav className="grid grid-cols-[auto_1fr_auto_auto_auto] items-stretch divide-x divide-ink border-b-2 border-ink bg-paper">
      <Link
        to="/dashboard"
        className="flex items-center px-4 py-3 font-display text-lg uppercase tracking-tightest"
      >
        MCL<span className="text-hazard">®</span>
      </Link>
      <div className="flex items-center gap-4 px-4 py-3 font-mono text-xs uppercase tracking-wide2">
        <Link to="/dashboard" className="hover:text-hazard">
          Dashboard
        </Link>
        <Link to="/kyc" className="hover:text-hazard">
          KYC
        </Link>
        {(user.role === "officer" || user.role === "admin") && (
          <Link to="/officer" className="hover:text-hazard">
            Officer Panel
          </Link>
        )}
      </div>
      <div className="flex items-center gap-2 px-4 py-3">
        <Badge>{user.role}</Badge>
        <span className="font-mono text-xs text-ink/70">{user.email}</span>
      </div>
      <div className="flex items-center px-4 py-3">
        <Button variant="secondary" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </nav>
  );
}
