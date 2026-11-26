// Local test harness only. Never imported by the production application.
const user = { id: 1, firstName: "Collaudo", lastName: "Nome molto lungo del responsabile", email: "collaudo@example.test" };
const club = { id: 999, name: "Società di collaudo con denominazione molto lunga" };
export function useAuth() {
  const params=new URLSearchParams(location.search);const returning=new URL(params.get("returnTo")||"/",location.origin);
  const role = params.get("role") || returning.searchParams.get("role") || "secretary";
  return {
    user,
    club,
    role,
    profileKey: "test:1",
    section: "scuola-calcio",
    sections: ["scuola-calcio"],
    isLoading: false,
    logout: () => {},
    login: () => {},
    register: () => {},
    isLoggingIn: false,
    isRegistering: false,
  };
}
