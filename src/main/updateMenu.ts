// What the menu-bar menu says about app updates (see updater.ts). Pure, so it is tested.

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking"; manual: boolean }
  | { kind: "current"; manual: boolean }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "ready"; version: string }
  | { kind: "failed"; manual: boolean };

export type UpdateMenuItem = { label: string; enabled: boolean; action: "check" | "install" | null };

// What the menu-bar menu says about updates. Results of an automatic check stay
// quiet; a check the user asked for says how it went.
export function updateMenuItems(s: UpdateState): UpdateMenuItem[] {
  switch (s.kind) {
    case "checking":
      return [{ label: "Checking for updates…", enabled: false, action: null }];
    case "downloading":
      return [{ label: `Downloading update ${s.version}… ${Math.floor(s.percent)}%`, enabled: false, action: null }];
    case "ready":
      return [{ label: `Restart to update to ${s.version}`, enabled: true, action: "install" }];
    case "current":
      return s.manual
        ? [{ label: "You're up to date", enabled: false, action: null }, { label: "Check for updates", enabled: true, action: "check" }]
        : [{ label: "Check for updates", enabled: true, action: "check" }];
    case "failed":
      return s.manual
        ? [{ label: "Couldn't check for updates", enabled: false, action: null }, { label: "Check for updates", enabled: true, action: "check" }]
        : [{ label: "Check for updates", enabled: true, action: "check" }];
    default:
      return [{ label: "Check for updates", enabled: true, action: "check" }];
  }
}
