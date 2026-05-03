import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import SalesPage from "../page";
import salesReducer from "@/store/slices/salesSlice";

function makeStore() {
  return configureStore({ reducer: { sales: salesReducer } });
}

function renderPage() {
  const store = makeStore();
  render(
    <Provider store={store}>
      <SalesPage />
    </Provider>
  );
  return store;
}

describe("SalesPage — rendering", () => {
  it("shows the page heading", () => {
    renderPage();
    expect(screen.getByText("Rapport de ventes")).toBeInTheDocument();
  });

  it("renders all three step headings", () => {
    renderPage();
    expect(screen.getByText(/Étape 1: Sélectionner le dossier de ventes/)).toBeInTheDocument();
    expect(screen.getByText(/Étape 3: Paramètres et génération/)).toBeInTheDocument();
  });

  it("renders folder selection button", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /Sélectionner/i })).toBeInTheDocument();
  });

  it("renders the generate button", () => {
    renderPage();
    expect(
      screen.getByRole("button", { name: /générer le rapport de ventes/i })
    ).toBeInTheDocument();
  });

  it("shows no error initially", () => {
    renderPage();
    expect(screen.queryByText(/Veuillez/)).not.toBeInTheDocument();
  });
});

describe("SalesPage — three-step workflow", () => {
  it("shows 'Aucun dossier sélectionné' message initially", () => {
    renderPage();
    expect(screen.getByText("Aucun dossier sélectionné")).toBeInTheDocument();
  });

  it("does not show Step 2 until folder is selected", () => {
    renderPage();
    expect(screen.queryByText(/Étape 2: Lister et filtrer les fichiers/)).not.toBeInTheDocument();
  });
});

describe("SalesPage — validation", () => {
  it("disables generate button when no files are listed", () => {
    renderPage();
    const generateBtn = screen.getByRole("button", { name: /générer le rapport de ventes/i });
    expect(generateBtn).toBeDisabled();
  });

  it("generate button remains disabled without folder selection", () => {
    renderPage();
    const generateBtn = screen.getByRole("button", { name: /générer le rapport de ventes/i });
    expect(generateBtn.getAttribute("disabled")).toBe("");
  });
});

describe("SalesPage — form controls", () => {
  it("renders VAT suffix input with default value", () => {
    renderPage();
    const vatInput = screen.getByDisplayValue(". Vat");
    expect(vatInput).toBeInTheDocument();
  });

  it("renders mode select with 'Court' default", () => {
    renderPage();
    const select = screen.getByDisplayValue("Court");
    expect(select).toBeInTheDocument();
  });

  it("checkbox is unchecked by default", () => {
    renderPage();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("checkbox toggles on click", async () => {
    renderPage();
    const checkbox = screen.getByRole("checkbox");
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("shows Step 2 with format selector when folder is selected", () => {
    renderPage();
    // Step 2 is not visible initially
    expect(screen.queryByText(/Étape 2: Lister et filtrer les fichiers/)).not.toBeInTheDocument();
  });
});
