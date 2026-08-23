type BrowserProtocol = Pick<Location, "protocol">;

export const googleAuthFlowForLocation = (
  browserLocation: BrowserProtocol | undefined
): "popup" | "redirect" => browserLocation?.protocol === "https:" ? "redirect" : "popup";
