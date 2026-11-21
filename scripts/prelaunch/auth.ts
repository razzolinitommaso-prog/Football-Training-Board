// Local test harness only. Never imported by the production application.
export function useAuth() {
  const role = new URLSearchParams(location.search).get("role") || "secretary";
  return {
    user: {
      id: 1,
      firstName: "Collaudo",
      lastName: "Nome molto lungo del responsabile",
      email: "collaudo@example.test",
    },
    club: {
      id: 999,
      name: "Società di collaudo con denominazione molto lunga",
    },
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
