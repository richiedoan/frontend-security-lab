// Exact fixtures only; the combined fixture is retained only for legacy cleanup.
export const EXECUTION_PAYLOAD = `<img src="data:image/png;base64,AA==" onerror='document.body.dataset.xssLab = "executed"'>`;
export const STORAGE_PAYLOAD = `<img src="data:image/png;base64,AA==" onerror='document.body.dataset.xssLabValue = localStorage.getItem("xssLabMarker") ?? "(missing)"'>`;
export const LEGACY_COMBINED_PAYLOAD = `<img src="data:image/png;base64,AA==" onerror='document.body.dataset.xssLabValue = localStorage.getItem("xssLabMarker") ?? "(missing)"; document.body.dataset.xssLab = "executed"'>`;
