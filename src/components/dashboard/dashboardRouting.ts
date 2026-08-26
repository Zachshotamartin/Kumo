export type DashboardRouteView = "boards" | "friends" | "profile" | "inbox" | "templates" | "workspace" | "community" | "settings";

export const dashboardRouteFromUrl = (href: string) => {
  const params = new URL(href).searchParams;
  const profile = params.get("profile");
  const template = params.get("template");
  const community = params.get("community");
  const requestedView = params.get("view");
  const simpleViews: DashboardRouteView[] = ["boards", "friends", "profile", "inbox", "templates", "workspace", "community", "settings"];
  const view: DashboardRouteView = profile ? "profile"
    : template ? "templates"
    : community ? "community"
    : simpleViews.includes(requestedView as DashboardRouteView) ? requestedView as DashboardRouteView
    : "boards";
  return { view, profile, template, community };
};
