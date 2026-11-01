// Set by the edit desk (desk/main.tsx) before it renders: the preview plays videos with the browser's own
// hardware decoder (Html5Video) instead of frame-exact decoding, which is what a render needs but a live preview
// cannot keep up with. Renders never set it.
export const PREVIEW = {html5: false};
