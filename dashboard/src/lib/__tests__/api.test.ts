import { api } from "../api";

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

describe("api.getSnapshots", () => {
  it("returns parsed JSON on success", async () => {
    const data = [{ name: "snap1", filename: "snap1.csv" }];
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => data });
    await expect(api.getSnapshots()).resolves.toEqual(data);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/api/snapshots"));
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    await expect(api.getSnapshots()).rejects.toThrow();
  });
});

describe("api.getResults", () => {
  it("returns parsed JSON on success", async () => {
    const data = [{ name: "r.xlsx", type: "payment", size: 100, modified: 1700000000 }];
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => data });
    await expect(api.getResults()).resolves.toEqual(data);
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    await expect(api.getResults()).rejects.toThrow();
  });
});

describe("api.getDownloadUrl", () => {
  it("encodes name and type in URL", () => {
    const url = api.getDownloadUrl("report file.xlsx", "payment");
    expect(url).toContain("name=report%20file.xlsx");
    expect(url).toContain("type=payment");
    expect(url).toContain("/api/results/download");
  });
});

describe("api.uploadSnapshot", () => {
  it("posts FormData to /api/snapshots/upload", async () => {
    const snap = { name: "s1", filename: "s1.csv" };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => snap });

    const file  = new File(["a"], "a.csv", { type: "text/csv" });
    const files = Object.assign([file], { length: 1, item: () => file }) as unknown as FileList;

    const result = await api.uploadSnapshot({ files, refDate: "2025-01-01", format: "Csv" });
    expect(result).toEqual(snap);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/snapshots/upload");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("throws when response has error field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Fichier invalide" }),
    });
    const file  = new File(["a"], "a.csv");
    const files = Object.assign([file], { length: 1, item: () => file }) as unknown as FileList;
    await expect(
      api.uploadSnapshot({ files, refDate: "2025-01-01", format: "Csv" })
    ).rejects.toThrow("Fichier invalide");
  });
});

describe("api.runPayment", () => {
  it("posts FormData to /api/payment/run", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, files: [] }),
    });
    const file = new File(["x"], "invoice.csv");
    await api.runPayment({
      snapshotName: "snap1",
      invoiceFile:  file,
      factDate:     "2025-01-15",
      periodStart:  "2024-12-01",
      periodEnd:    "2024-12-31",
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/payment/run");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
  });
});

describe("api.runSales", () => {
  it("posts FormData to /api/sales/run", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, files: [] }),
    });
    const file  = new File(["a"], "sales.csv");
    const files = Object.assign([file], { length: 1, item: () => file }) as unknown as FileList;
    await api.runSales({
      files,
      downloadDate:  "2025-01-15",
      vatSuffix:     ". Vat",
      format:        "Csv",
      mode:          "short",
      onlyCheckedIn: false,
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/sales/run");
    expect(init.body).toBeInstanceOf(FormData);
  });
});
