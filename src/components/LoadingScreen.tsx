import KumoLogo from "./brand/KumoLogo";

const LoadingScreen = () => (
  <div className="app-loading" role="status">
    <KumoLogo className="app-loading-logo" context="loading" startupAnimation="startup" animationScope="app-startup" decorative />
    <div className="app-loading-copy">
      <span className="app-loading-word">Kumo</span>
      <span className="app-loading-status">Opening your canvas</span>
    </div>
  </div>
);

export default LoadingScreen;
