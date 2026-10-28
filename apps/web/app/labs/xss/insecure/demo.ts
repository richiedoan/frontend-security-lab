// Fixed local-only payloads; never accept arbitrary HTML here.
export const EXECUTION_PAYLOAD = `<img src="data:image/png;base64,AA==" onerror='document.body.dataset.xssLab = "executed"'>`;
export const STORAGE_PAYLOAD = `<img src="data:image/png;base64,AA==" onerror='document.body.dataset.xssLabValue = localStorage.getItem("xssLabMarker") ?? "(missing)"'>`;
export const LEGACY_COMBINED_PAYLOAD = `<img src="data:image/png;base64,AA==" onerror='document.body.dataset.xssLabValue = localStorage.getItem("xssLabMarker") ?? "(missing)"; document.body.dataset.xssLab = "executed"'>`;
export const FAKE_MARKER_VALUE = "fake-xss-lab-value";
export type DemoKind = "execution" | "storage";

export function clearExecutionMarker(dataset: DOMStringMap) {
  delete dataset.xssLab;
}

export function clearStorageMarker(dataset: DOMStringMap, storage: Pick<Storage, "removeItem">) {
  delete dataset.xssLabValue;
  storage.removeItem("xssLabMarker");
}
