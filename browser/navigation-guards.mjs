import { isAllowedNavigation, isHostedGameUrl } from "./url-policy.mjs";

export function classifyNavigation(details) {
  if (!isAllowedNavigation(details?.url)) return "block";
  if (!details.isMainFrame && isHostedGameUrl(details.url)) return "promote-game";
  return "allow";
}

export function installNavigationGuards(contents, schedule = setImmediate) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) schedule(() => contents.loadURL(url));
    return { action: "deny" };
  });

  const blockDisallowedMainNavigation = (details) => {
    if (classifyNavigation(details) === "block") details.preventDefault();
  };

  contents.on("will-navigate", blockDisallowedMainNavigation);
  contents.on("will-redirect", blockDisallowedMainNavigation);
  contents.on("will-frame-navigate", (details) => {
    const action = classifyNavigation(details);
    if (action === "allow") return;

    details.preventDefault();
    if (action === "promote-game") {
      schedule(() => contents.loadURL(details.url));
    }
  });
}
