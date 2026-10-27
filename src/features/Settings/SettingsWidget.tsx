import "./styles/SettingsWidget.css";
import type { ReactNode } from "react";
import Widget, { type DockSide } from "@/components/Widget";
import { Segmented, Toggle } from "@/components/Controls";
import { DEFAULT_SETTINGS, LANGUAGES, type Settings } from "./settings";
import { languageLabel } from "@/features/Diff/syntax";

type SettingsWidgetProps = {
  settings: Settings;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onReset: () => void;
  detectedLanguage: string | null;
  ruleErrors: string[];
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  dock: DockSide | null;
  onDockChange: (dock: DockSide | null) => void;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h4 className="settings-heading">{title}</h4>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="settings-field">
      <span className="settings-label">{label}</span>
      {children}
    </div>
  );
}

function SettingsWidget({ settings, onChange, onReset, detectedLanguage, ruleErrors, collapsed, onCollapsedChange, dock, onDockChange }: SettingsWidgetProps) {
  const isDefault = (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).every((key) => settings[key] === DEFAULT_SETTINGS[key]);

  return (
    <Widget title="Settings" className="settings-widget" collapsed={collapsed} onCollapsedChange={onCollapsedChange} dock={dock} onDockChange={onDockChange}>
      <Section title="View">
        <Field label="Layout">
          <Segmented
            label="Layout"
            value={settings.mode}
            onChange={(value) => onChange("mode", value)}
            options={[
              { value: "split", label: "Split" },
              { value: "unified", label: "Unified" },
            ]}
          />
        </Field>
        <Field label="Diff precision">
          <Segmented
            label="Diff precision"
            value={settings.precision}
            onChange={(value) => onChange("precision", value)}
            options={[
              { value: "smart", label: "Smart" },
              { value: "word", label: "Word" },
              { value: "char", label: "Char" },
            ]}
          />
        </Field>
        <Field label="Syntax highlighting">
          <div className="settings-select-row">
            <select className="select" value={settings.syntax} onChange={(event) => onChange("syntax", event.target.value)} aria-label="Syntax highlighting">
              {LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
            {settings.syntax === "auto" && <span className="badge badge-accent">{detectedLanguage ? languageLabel(detectedLanguage, LANGUAGES) : "—"}</span>}
          </div>
        </Field>
        <div className="settings-toggles">
          <Toggle label="Hide unchanged lines" checked={settings.collapse} onChange={(value) => onChange("collapse", value)} />
          <Toggle label="Line wrap" checked={settings.wrap} onChange={(value) => onChange("wrap", value)} hint="Off: long lines scroll horizontally" />
        </div>
      </Section>

      <Section title="Comparison">
        <div className="settings-toggles">
          <Toggle label="Hide whitespace changes" checked={settings.ignoreWhitespace} onChange={(value) => onChange("ignoreWhitespace", value)} hint="Indentation, spacing and trailing whitespace" />
          <Toggle label="Ignore case changes" checked={settings.ignoreCase} onChange={(value) => onChange("ignoreCase", value)} />
          <Toggle label="Real-time editor" checked={settings.realtime} onChange={(value) => onChange("realtime", value)} hint="Recalculate while you type" />
        </div>
        <Field label="Custom ignore rules">
          <textarea
            className="settings-rules"
            value={settings.ignoreRules}
            onChange={(event) => onChange("ignoreRules", event.target.value)}
            placeholder={"One rule per line, e.g.\nsessionId\n/\\d{2}:\\d{2}:\\d{2}/"}
            spellCheck={false}
            rows={3}
          />
          {ruleErrors.length > 0 ? (
            <ul className="settings-errors">
              {ruleErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : (
            <span className="settings-hint">Plain text or /regex/flags — matches are skipped.</span>
          )}
        </Field>
      </Section>

      <Section title="Shortcuts">
        <dl className="settings-shortcuts">
          <dt>
            <kbd>Ctrl</kbd> <kbd>↵</kbd>
          </dt>
          <dd>Find difference</dd>
          <dt>
            <kbd>Alt</kbd> <kbd>↑</kbd> <kbd>↓</kbd>
          </dt>
          <dd>Previous / next change</dd>
        </dl>
      </Section>

      <div className="settings-footer">
        <button type="button" className="btn btn-small" onClick={onReset} disabled={isDefault}>
          Reset to defaults
        </button>
      </div>
    </Widget>
  );
}

export default SettingsWidget;
