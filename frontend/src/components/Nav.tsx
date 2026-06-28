import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../App";

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <nav className="flex gap-4 items-center p-4 border-b">
      <Link to="/dashboard">Dashboard</Link>
      <Link to="/kyc">KYC</Link>
      {(user.role === "officer" || user.role === "admin") && (
        <Link to="/officer">Officer Panel</Link>
      )}
      <span className="ml-auto text-sm text-gray-600">{user.email}</span>
      <button onClick={handleLogout}>Logout</button>
    </nav>
  );
}
