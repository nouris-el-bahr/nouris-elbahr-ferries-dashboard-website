import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import PaymentPage from "../page";
import snapshotsReducer from "@/store/slices/snapshotsSlice";
import paymentReducer from "@/store/slices/paymentSlice";
import { api } from "@/lib/api";

jest.mock("@/lib/api");
const mockApi = api as jest.Mocked<typeof api>;

function makeStore() {
  return configureStore({
    reducer: { snapshots: snapshotsReducer, payment: paymentReducer },
  });
}

function renderPage() {
  const store = makeStore();
  render(
    <Provider store={store}>
      <PaymentPage />
    </Provider>
  );
  return store;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockApi.getSnapshots.mockResolvedValue([]);
});

describe("PaymentPage — rendering", () => {
  it("shows the page heading", async () => {
    renderPage();
    expect(screen.getByText("Rapport de paiement")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Chargement…")).not.toBeInTheDocument()
    );
  });

  it("shows both step badges", async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText("Chargement…")).not.toBeInTheDocument());
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("fetches snapshots on mount", async () => {
    renderPage();
    await waitFor(() => expect(mockApi.getSnapshots).toHaveBeenCalledTimes(1));
  });
});

describe("PaymentPage — snapshot list", () => {
  it("shows empty-state option when no snapshots exist", async () => {
    mockApi.getSnapshots.mockResolvedValueOnce([]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Aucun snapshot archivé/i)).toBeInTheDocument()
    );
  });

  it("renders snapshot names in the dropdown", async () => {
    mockApi.getSnapshots.mockResolvedValueOnce([
      { name: "ref-2025-03", filename: "ref-2025-03.csv" },
    ]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("ref-2025-03")).toBeInTheDocument()
    );
  });
});

describe("PaymentPage — validation", () => {
  it("shows error when Run is clicked with no snapshot", async () => {
    mockApi.getSnapshots.mockResolvedValueOnce([]);
    renderPage();
    await waitFor(() => expect(screen.queryByText("Chargement…")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /générer le rapport de paiement/i }));

    expect(
      screen.getByText(/veuillez sélectionner un snapshot/i)
    ).toBeInTheDocument();
  });

  it("shows error when Run is clicked with no invoice file", async () => {
    mockApi.getSnapshots.mockResolvedValueOnce([
      { name: "snap1", filename: "snap1.csv" },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText("snap1")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /générer le rapport de paiement/i }));

    expect(
      screen.getByText(/veuillez sélectionner le fichier de facture/i)
    ).toBeInTheDocument();
  });
});

describe("PaymentPage — new snapshot form", () => {
  it("toggles the archive form on button click", async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText("Chargement…")).not.toBeInTheDocument());

    const toggleBtn = screen.getByRole("button", { name: /archiver un nouveau snapshot/i });
    expect(screen.queryByText("Date de la référence")).not.toBeInTheDocument();

    await userEvent.click(toggleBtn);
    expect(screen.getByText("Date de la référence")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /masquer/i }));
    expect(screen.queryByText("Date de la référence")).not.toBeInTheDocument();
  });
});
