import { render, screen, fireEvent } from "@testing-library/react";
import PathInput from "../PathInput";

const onSelect = jest.fn();

beforeEach(() => onSelect.mockReset());

describe("PathInput — rendering", () => {
  it("renders the label", () => {
    render(<PathInput label="Mon dossier" selected="" onSelect={onSelect} />);
    expect(screen.getByText("Mon dossier")).toBeInTheDocument();
  });

  it("shows folder placeholder when nothing selected (folder mode)", () => {
    render(<PathInput label="L" selected="" onSelect={onSelect} mode="folder" />);
    expect(screen.getByText("Aucun dossier sélectionné")).toBeInTheDocument();
  });

  it("shows file placeholder when nothing selected (file mode)", () => {
    render(<PathInput label="L" selected="" onSelect={onSelect} mode="file" />);
    expect(screen.getByText("Aucun fichier sélectionné")).toBeInTheDocument();
  });

  it("displays the selected label text", () => {
    render(<PathInput label="L" selected="3 fichier(s) — myFolder" onSelect={onSelect} />);
    expect(screen.getByText("3 fichier(s) — myFolder")).toBeInTheDocument();
  });

  it("renders the Parcourir button", () => {
    render(<PathInput label="L" selected="" onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: /parcourir/i })).toBeInTheDocument();
  });

  it("renders hint text when provided", () => {
    render(<PathInput label="L" selected="" onSelect={onSelect} hint="Choisissez un dossier" />);
    expect(screen.getByText("Choisissez un dossier")).toBeInTheDocument();
  });

  it("does not render hint when not provided", () => {
    render(<PathInput label="L" selected="" onSelect={onSelect} />);
    expect(screen.queryByText("Choisissez un dossier")).not.toBeInTheDocument();
  });
});

describe("PathInput — file input hidden", () => {
  it("has a hidden file input", () => {
    render(<PathInput label="L" selected="" onSelect={onSelect} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input).toHaveClass("hidden");
  });

  it("calls onSelect with the FileList when files are changed", () => {
    render(<PathInput label="L" selected="" onSelect={onSelect} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["content"], "test.csv", { type: "text/csv" });
    Object.defineProperty(input, "files", {
      value: Object.assign([file], { length: 1, item: () => file }),
      configurable: true,
    });
    fireEvent.change(input);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("does not call onSelect when file list is empty", () => {
    render(<PathInput label="L" selected="" onSelect={onSelect} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: Object.assign([], { length: 0, item: () => null }),
      configurable: true,
    });
    fireEvent.change(input);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
