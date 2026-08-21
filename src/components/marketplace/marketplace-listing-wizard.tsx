"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, CarFront, Check, ImagePlus, Package, Save, Search, Trash2, Upload, UsersRound, Wrench, X } from "lucide-react";

import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import type { MarketplaceListingInput, MarketplaceListingKind, MarketplacePublisherKind } from "@/modules/marketplace/marketplace.contracts";
import { MARKETPLACE_TAXONOMY } from "@/modules/marketplace/marketplace-taxonomy";
import type { MarketplaceTemplateDefinition, MarketplaceTemplateField } from "@/modules/marketplace/marketplace-templates";
import type { MarketplaceListingDetailView } from "@/modules/marketplace/marketplace-view";
import styles from "./marketplace.module.css";

type PublisherChoice = { kind: MarketplacePublisherKind; id: string; name: string };
type CreateState = { allowed: boolean; reason?: string; photoCap: number; publishers: PublisherChoice[] };
type UploadItem = { id: string; file?: File; mediaAssetId?: string; name: string; previewUrl?: string | null; progress: number; status: "ready" | "uploading" | "done" | "failed" };
type WizardDraft = {
  kind: MarketplaceListingKind;
  intent: "OFFER" | "WANTED";
  title: string;
  summary: string;
  description: string;
  category: string;
  subcategory: string;
  condition: string;
  attributes: Record<string, unknown>;
  priceType: MarketplaceListingInput["priceType"];
  price: string;
  priceMin: string;
  priceMax: string;
  currency: string;
  publisherKey: string;
  countryCode: string;
  region: string;
  city: string;
  postalArea: string;
  exactAddress: string;
  remote: boolean;
  deliveryAvailable: boolean;
  allowInAppMessages: boolean;
  email: string;
  phone: string;
  website: string;
  contactInstructions: string;
  showEmail: boolean;
  showPhone: boolean;
  showWebsite: boolean;
  showExactAddress: boolean;
};

const DRAFT_KEY = "theta-marketplace-listing-draft-v1";
const kindIcons = { GOODS: Package, VEHICLE: CarFront, RENTAL: Building2, SERVICE: Wrench, JOB: BriefcaseBusiness, AUDITOR: UsersRound };
const stepNames = ["Type", "Details", "Price & location", "Contact & photos"];
const legacyCategoryMap: Partial<Record<MarketplaceListingKind, Record<string, string>>> = {
  GOODS: { "Furniture & Equipment": "Furniture & Decor", "Electronics & Appliances": "Electronics", "Event Supplies": "Event & Wedding" },
  VEHICLE: { "Cars & Trucks": "Cars", Recreational: "RVs & Campers", Commercial: "Commercial Vehicles", Parts: "Parts & Accessories" },
  RENTAL: { Houses: "Houses", Rooms: "Rooms & Shared Housing", "Short-term": "Short-term Stays", Commercial: "Commercial Property", "Housing wanted": "Housing Wanted" },
  SERVICE: { "Home Services": "Home Repair & Maintenance", Creative: "Creative Services", Transport: "Transport & Delivery", Education: "Education & Tutoring" },
  JOB: { Technical: "Technology", Sales: "Sales & Business Development", Delivery: "Transport & Logistics", Creative: "Creative & Design", "Professional Services": "Accounting & Finance", Hospitality: "Hospitality & Food Service", Construction: "Construction & Skilled Trades" },
  AUDITOR: { "Auditing wanted": "Auditing Wanted" },
};

function currentCategory(kind: MarketplaceListingKind, category: string) {
  return legacyCategoryMap[kind]?.[category] ?? category;
}

function emptyDraft(templates: Record<MarketplaceListingKind, MarketplaceTemplateDefinition>, publisherKey: string, initialIntent: "OFFER" | "WANTED" = "OFFER"): WizardDraft {
  return {
    kind: "GOODS", intent: initialIntent, title: "", summary: "", description: "", category: templates.GOODS.categories[0] ?? "General", subcategory: "", condition: "", attributes: {},
    priceType: "FIXED", price: "", priceMin: "", priceMax: "", currency: "USD", publisherKey,
    countryCode: "", region: "", city: "", postalArea: "", exactAddress: "", remote: false, deliveryAvailable: false,
    allowInAppMessages: true, email: "", phone: "", website: "", contactInstructions: "", showEmail: false, showPhone: false, showWebsite: false, showExactAddress: false,
  };
}

function existingDraft(listing: MarketplaceListingDetailView, publisherKey: string): WizardDraft {
  const money = (value: number | null) => value == null ? "" : String(value / 100);
  return {
    kind: listing.kind, intent: listing.intent, title: listing.title, summary: listing.summary ?? "", description: listing.description, category: currentCategory(listing.kind, listing.category), subcategory: listing.subcategory ?? "", condition: listing.condition ?? "", attributes: listing.attributes as Record<string, unknown>,
    priceType: listing.priceType, price: money(listing.priceCents), priceMin: money(listing.priceMinCents), priceMax: money(listing.priceMaxCents), currency: listing.currency, publisherKey,
    countryCode: listing.countryCode ?? "", region: listing.region ?? "", city: listing.city ?? "", postalArea: listing.postalArea ?? "", exactAddress: listing.exactAddress ?? "", remote: listing.remote, deliveryAvailable: listing.deliveryAvailable,
    allowInAppMessages: listing.allowInAppMessages, email: listing.contactEmail ?? "", phone: listing.contactPhone ?? "", website: listing.contactWebsite ?? "", contactInstructions: listing.contactInstructions ?? "", showEmail: Boolean(listing.contactEmail), showPhone: Boolean(listing.contactPhone), showWebsite: Boolean(listing.contactWebsite), showExactAddress: Boolean(listing.exactAddress),
  };
}

function cents(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}

function unitKey(fieldKey: string) {
  if (fieldKey === "weight") return "weightUnit";
  if (fieldKey === "mileage") return "mileageUnit";
  if (fieldKey === "area") return "areaUnit";
  return ["length", "width", "height"].includes(fieldKey) ? "dimensionUnit" : `${fieldKey}Unit`;
}

function MarketplaceAttributeField({ field, intent, value, unit, onChange, onUnitChange }: { field: MarketplaceTemplateField; intent: "OFFER" | "WANTED"; value: unknown; unit?: string; onChange: (value: unknown) => void; onUnitChange: (value: string) => void }) {
  const required = Boolean(field.requiredFor?.includes(intent));
  if (field.type === "boolean") return <label className={styles.checkboxField}><input checked={value === true} onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span>{field.label}</span></label>;
  if (field.type === "textarea") return <label className={`${styles.formField} ${styles.fullField}`}><span>{field.label}{required ? " *" : ""}</span><textarea className={styles.textarea} onChange={(event) => onChange(event.target.value)} required={required} value={typeof value === "string" ? value : ""} />{field.help ? <small>{field.help}</small> : null}</label>;
  if (field.type === "select") return <label className={styles.formField}><span>{field.label}{required ? " *" : ""}</span><select className={styles.select} onChange={(event) => onChange(event.target.value || null)} required={required} value={typeof value === "string" ? value : ""}><option value="">Choose...</option>{field.options?.map((option) => <option key={option} value={option}>{option.replace(/-/g, " ")}</option>)}</select>{field.help ? <small>{field.help}</small> : null}</label>;
  if (field.type === "multiselect") return <label className={styles.formField}><span>{field.label}{required ? " *" : ""}</span><input className={styles.field} onChange={(event) => onChange(event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} placeholder="Separate entries with commas" required={required} value={Array.isArray(value) ? value.join(", ") : ""} />{field.help ? <small>{field.help}</small> : null}</label>;
  const displayedValue = field.key === "depositCents" && typeof value === "number" ? value / 100 : value;
  const input = <input className={styles.field} min={field.type === "number" ? 0 : undefined} onChange={(event) => onChange(field.type === "number" ? (event.target.value === "" ? null : field.key === "depositCents" ? Math.round(Number(event.target.value) * 100) : Number(event.target.value)) : event.target.value)} required={required} step={field.type === "number" ? "any" : undefined} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={typeof displayedValue === "string" || typeof displayedValue === "number" ? displayedValue : ""} />;
  return <label className={styles.formField}><span>{field.label}{required ? " *" : ""}</span>{field.unitOptions ? <span className={styles.inputWithUnit}>{input}<select aria-label={`${field.label} unit`} className={styles.select} onChange={(event) => onUnitChange(event.target.value)} value={unit ?? field.unitOptions[0]}>{field.unitOptions.map((option) => <option key={option}>{option}</option>)}</select></span> : input}{field.help ? <small>{field.help}</small> : null}</label>;
}

export function MarketplaceListingWizard({
  createState,
  initialIntent = "OFFER",
  initialListing,
  templates,
}: {
  createState: CreateState;
  initialIntent?: "OFFER" | "WANTED";
  initialListing?: MarketplaceListingDetailView;
  templates: Record<MarketplaceListingKind, MarketplaceTemplateDefinition>;
}) {
  const firstPublisher = createState.publishers[0] ? `${createState.publishers[0].kind}:${createState.publishers[0].id}` : "PERSONAL:";
  const initialPublisher = initialListing
    ? `${initialListing.publisher.kind}:${initialListing.publisher.id}`
    : firstPublisher;
  const [draft, setDraft] = useState<WizardDraft>(() => initialListing ? existingDraft(initialListing, initialPublisher) : emptyDraft(templates, firstPublisher, initialIntent));
  const [step, setStep] = useState(0);
  const [uploads, setUploads] = useState<UploadItem[]>(() => initialListing?.media.map((media) => ({ id: media.id, mediaAssetId: media.mediaAssetId, name: media.altText ?? "Listing image", previewUrl: media.url, progress: 100, status: "done" })) ?? []);
  const [dropActive, setDropActive] = useState(false);
  const [error, setError] = useState(createState.allowed ? "" : createState.reason ?? "Listing creation is not available.");
  const [isPending, startTransition] = useTransition();
  const template = templates[draft.kind];
  const taxonomyCategory = MARKETPLACE_TAXONOMY[draft.kind].find((category) => category.label === draft.category);

  useEffect(() => {
    if (initialListing) return;
    const stored = window.localStorage.getItem(DRAFT_KEY);
    if (!stored) return;
    try { setDraft((current) => ({ ...current, ...(JSON.parse(stored) as Partial<WizardDraft>) })); } catch { window.localStorage.removeItem(DRAFT_KEY); }
  }, [initialListing]);

  useEffect(() => {
    if (!initialListing) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, initialListing]);

  const selectedPublisher = useMemo(() => createState.publishers.find((publisher) => `${publisher.kind}:${publisher.id}` === draft.publisherKey) ?? createState.publishers[0], [createState.publishers, draft.publisherKey]);

  function patch(values: Partial<WizardDraft>) { setDraft((current) => ({ ...current, ...values })); }
  function setKind(kind: MarketplaceListingKind) { patch({ kind, category: templates[kind].categories[0] ?? "Other", subcategory: "", attributes: {}, priceType: kind === "JOB" ? "RANGE" : kind === "SERVICE" || kind === "AUDITOR" ? "QUOTE" : "FIXED" }); }
  function updateAttribute(key: string, value: unknown) { patch({ attributes: { ...draft.attributes, [key]: value } }); }

  function addFiles(files: FileList | File[]) {
    const selected = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (selected.length !== Array.from(files).length) setError("Listing media must be an image for this release.");
    const remaining = Math.max(0, createState.photoCap - uploads.length);
    if (!remaining) { setError(`Your plan supports ${createState.photoCap} listing images.`); return; }
    setUploads((current) => [...current, ...selected.slice(0, remaining).map((file) => ({ id: crypto.randomUUID(), file, name: file.name, previewUrl: URL.createObjectURL(file), progress: 0, status: "ready" as const }))]);
  }

  function updateUpload(id: string, values: Partial<UploadItem>) { setUploads((current) => current.map((item) => item.id === id ? { ...item, ...values } : item)); }

  async function uploadMedia() {
    const ids: string[] = [];
    for (const item of uploads) {
      if (item.mediaAssetId) { ids.push(item.mediaAssetId); continue; }
      if (!item.file) continue;
      updateUpload(item.id, { status: "uploading", progress: 1 });
      const intentResponse = await fetch("/api/v2/marketplace/media/upload-intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: item.file.name, mimeType: item.file.type, sizeBytes: item.file.size }) });
      const intent = await intentResponse.json() as { error?: string; intentId?: string; uploadUrl?: string; uploadHeaders?: Record<string, string>; storageKey?: string };
      if (!intentResponse.ok || !intent.intentId || !intent.uploadUrl || !intent.uploadHeaders || !intent.storageKey) throw new Error(intent.error ?? "Could not prepare image upload.");
      await uploadWithResilientFallback({ uploadUrl: intent.uploadUrl, storageKey: intent.storageKey, uploadHeaders: intent.uploadHeaders, file: item.file, onProgress: (progress) => updateUpload(item.id, { progress }) });
      const completeResponse = await fetch("/api/v2/marketplace/media/complete-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intentId: intent.intentId, storageKey: intent.storageKey, fileName: item.file.name, mimeType: item.file.type, sizeBytes: item.file.size }) });
      const complete = await completeResponse.json() as { error?: string; asset?: { id: string } };
      if (!completeResponse.ok || !complete.asset?.id) throw new Error(complete.error ?? "Could not save the image.");
      updateUpload(item.id, { mediaAssetId: complete.asset.id, status: "done", progress: 100 });
      ids.push(complete.asset.id);
    }
    return ids;
  }

  function validateStep(currentStep: number) {
    if (currentStep === 1 && (draft.title.trim().length < 4 || draft.description.trim().length < 20)) return "Add a clear title and a description of at least 20 characters.";
    if (currentStep === 2 && draft.countryCode.trim().length !== 2) return "Choose the two-letter country code where this listing is available.";
    if (currentStep === 2 && ["FIXED", "NEGOTIABLE"].includes(draft.priceType) && cents(draft.price) == null) return "Enter a valid price.";
    if (currentStep === 2 && draft.priceType === "RANGE" && (cents(draft.priceMin) == null || cents(draft.priceMax) == null)) return "Enter both ends of the price range.";
    if (currentStep === 3 && !draft.allowInAppMessages && !draft.showEmail && !draft.showPhone && !draft.showWebsite) return "Enable in-app messages or make one contact method visible.";
    return "";
  }

  function nextStep() { const issue = validateStep(step); if (issue) { setError(issue); return; } setError(""); setStep((current) => Math.min(current + 1, stepNames.length - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }

  function submit(publishNow: boolean) {
    const issue = validateStep(3);
    if (issue) { setError(issue); return; }
    startTransition(async () => {
      setError("");
      try {
        const mediaAssetIds = await uploadMedia();
        const publisher = selectedPublisher?.kind === "AUDITOR"
          ? { kind: "AUDITOR" as const, auditorProfileId: selectedPublisher.id }
          : selectedPublisher?.kind === "BUSINESS" || selectedPublisher?.kind === "ORGANIZATION"
            ? { kind: selectedPublisher.kind, businessProfileId: selectedPublisher.id }
            : { kind: "PERSONAL" as const };
        const listing: MarketplaceListingInput = {
          kind: draft.kind, intent: draft.intent, title: draft.title, summary: draft.summary || null, description: draft.description, category: draft.category, subcategory: draft.subcategory || null, condition: draft.condition || null, templateVersion: 1, attributes: draft.attributes,
          priceType: draft.priceType, priceCents: cents(draft.price), priceMinCents: cents(draft.priceMin), priceMaxCents: cents(draft.priceMax), currency: draft.currency.toUpperCase(), publisher,
          location: { countryCode: draft.countryCode.trim(), region: draft.region || null, city: draft.city || null, postalArea: draft.postalArea || null, exactAddress: draft.exactAddress || null, remote: draft.remote, deliveryAvailable: draft.deliveryAvailable },
          contact: { allowInAppMessages: draft.allowInAppMessages, email: draft.email || null, phone: draft.phone || null, website: draft.website || null, instructions: draft.contactInstructions || null, showEmail: draft.showEmail, showPhone: draft.showPhone, showWebsite: draft.showWebsite, showExactAddress: draft.showExactAddress },
          mediaAssetIds, primaryMediaAssetId: mediaAssetIds[0] ?? null,
        };
        const endpoint = initialListing ? `/api/v2/marketplace/listings/${initialListing.id}` : "/api/v2/marketplace/listings";
        const response = await fetch(endpoint, { method: initialListing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(initialListing ? listing : { listing, publish: publishNow }) });
        const payload = await response.json() as { error?: string; listing?: { slug?: string } };
        if (!response.ok || !payload.listing?.slug) throw new Error(payload.error ?? "Could not save the listing.");
        if (initialListing && publishNow && ["DRAFT", "PAUSED", "EXPIRED"].includes(initialListing.status)) {
          const publishResponse = await fetch(`/api/v2/marketplace/listings/${initialListing.id}/publish`, { method: "POST" });
          const publishPayload = await publishResponse.json() as { error?: string };
          if (!publishResponse.ok) throw new Error(publishPayload.error ?? "The listing was saved but could not be published.");
        }
        window.localStorage.removeItem(DRAFT_KEY);
        window.location.href = `/marketplace/${payload.listing.slug}`;
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the listing."); }
    });
  }

  if (!createState.allowed) return <div className={styles.emptyState}><div><X aria-hidden="true" /><h1>Listing creation unavailable</h1><p>{createState.reason}</p><Link className={styles.secondaryButton} href="/marketplace">Back to Marketplace</Link></div></div>;

  return (
    <div className={styles.page}>
      <header className={styles.wizardHeader}><div><p className={styles.eyebrow}>{initialListing ? "Edit listing" : "Create a listing"}</p><h1>{initialListing ? initialListing.title : "Post an offer or a need"}</h1><p className={styles.subhead}>Specific fields change with the listing type so responders have the details they need.</p></div><Link className={styles.secondaryButton} href={initialListing ? `/marketplace/${initialListing.slug}` : "/marketplace"}><X aria-hidden="true" />Cancel</Link></header>
      <ol className={styles.stepper}>{stepNames.map((name, index) => <li aria-current={step === index ? "step" : undefined} className={step === index ? styles.stepActive : index < step ? styles.stepDone : ""} key={name}><span>{index < step ? <Check aria-hidden="true" /> : index + 1}</span><strong>{name}</strong></li>)}</ol>

      <div className={styles.wizardBody}>
        {step === 0 ? <section className={styles.wizardSection}><p className={styles.sectionLabel}>What are you doing?</p><div className={styles.intentChoices}><button className={draft.intent === "OFFER" ? styles.choiceActive : ""} onClick={() => patch({ intent: "OFFER" })} type="button"><Upload aria-hidden="true" /><strong>I am offering</strong><span>Sell, rent, hire, or provide something.</span></button><button className={draft.intent === "WANTED" ? styles.choiceActive : ""} onClick={() => patch({ intent: "WANTED" })} type="button"><Search aria-hidden="true" /><strong>I need or want</strong><span>Ask for an item, place, job, service, or auditor.</span></button></div><p className={styles.sectionLabel}>Choose a listing type</p><div className={styles.kindChoices}>{(Object.keys(templates) as MarketplaceListingKind[]).map((kind) => { const Icon = kindIcons[kind]; return <button className={draft.kind === kind ? styles.choiceActive : ""} onClick={() => setKind(kind)} type="button" key={kind}><Icon aria-hidden="true" /><strong>{templates[kind].label}</strong><span>{kind === "GOODS" ? "Furniture, equipment, electronics, and other items" : kind === "VEHICLE" ? "Cars, trucks, motorcycles, and parts" : kind === "RENTAL" ? "Homes, rooms, commercial space, and housing needs" : kind === "SERVICE" ? "Professional, home, technology, and other services" : kind === "JOB" ? "Open roles and work wanted" : "Auditors, field groups, orgs, and auditing needs"}</span></button>; })}</div></section> : null}

        {step === 1 ? <section className={styles.wizardSection}><div className={styles.formGrid}><label className={`${styles.formField} ${styles.fullField}`}><span>Listing title</span><input className={styles.field} maxLength={140} onChange={(event) => patch({ title: event.target.value })} placeholder={draft.kind === "JOB" ? "Office manager - Austin, Texas" : draft.intent === "WANTED" ? "What do you need?" : "What are you offering?"} required value={draft.title} /></label><label className={styles.formField}><span>Category</span><select className={styles.select} onChange={(event) => patch({ category: event.target.value, subcategory: "" })} value={draft.category}>{template.categories.map((category) => <option key={category}>{category}</option>)}</select></label>{taxonomyCategory?.subcategories.length ? <label className={styles.formField}><span>Subcategory</span><select className={styles.select} onChange={(event) => patch({ subcategory: event.target.value })} value={draft.subcategory}><option value="">Choose the closest match</option>{taxonomyCategory.subcategories.map((subcategory) => <option key={subcategory}>{subcategory}</option>)}</select></label> : null}<label className={styles.formField}><span>Condition or status</span><input className={styles.field} maxLength={60} onChange={(event) => patch({ condition: event.target.value })} placeholder="New, used, available now..." value={draft.condition} /></label><label className={`${styles.formField} ${styles.fullField}`}><span>Short summary</span><input className={styles.field} maxLength={280} onChange={(event) => patch({ summary: event.target.value })} placeholder="One sentence shown on listing cards" value={draft.summary} /></label><label className={`${styles.formField} ${styles.fullField}`}><span>Full description</span><textarea className={styles.textarea} maxLength={12000} onChange={(event) => patch({ description: event.target.value })} placeholder="Describe what is included, important limitations, timing, and what a responder should know." required value={draft.description} /></label>{template.fields.map((field) => <MarketplaceAttributeField field={field} intent={draft.intent} key={field.key} onChange={(value) => updateAttribute(field.key, value)} onUnitChange={(value) => updateAttribute(unitKey(field.key), value)} unit={draft.attributes[unitKey(field.key)] as string | undefined} value={draft.attributes[field.key]} />)}</div></section> : null}

        {step === 2 ? <section className={styles.wizardSection}><div className={styles.formGrid}><label className={styles.formField}><span>Price format</span><select className={styles.select} onChange={(event) => patch({ priceType: event.target.value as WizardDraft["priceType"] })} value={draft.priceType}><option value="FIXED">Fixed price</option><option value="NEGOTIABLE">Negotiable</option><option value="RANGE">Range</option><option value="FREE">Free</option><option value="TRADE">Trade</option><option value="QUOTE">Quote</option><option value="CONTACT">Contact for price</option></select></label><label className={styles.formField}><span>Currency</span><input className={styles.field} maxLength={3} onChange={(event) => patch({ currency: event.target.value.toUpperCase() })} value={draft.currency} /></label>{["FIXED", "NEGOTIABLE"].includes(draft.priceType) ? <label className={styles.formField}><span>Price</span><input className={styles.field} min="0" onChange={(event) => patch({ price: event.target.value })} step="0.01" type="number" value={draft.price} /></label> : null}{draft.priceType === "RANGE" ? <><label className={styles.formField}><span>Minimum</span><input className={styles.field} min="0" onChange={(event) => patch({ priceMin: event.target.value })} step="0.01" type="number" value={draft.priceMin} /></label><label className={styles.formField}><span>Maximum</span><input className={styles.field} min="0" onChange={(event) => patch({ priceMax: event.target.value })} step="0.01" type="number" value={draft.priceMax} /></label></> : null}<label className={styles.checkboxField}><input checked={draft.remote} onChange={(event) => patch({ remote: event.target.checked })} type="checkbox" /><span>Remote or available online</span></label><label className={styles.checkboxField}><input checked={draft.deliveryAvailable} onChange={(event) => patch({ deliveryAvailable: event.target.checked })} type="checkbox" /><span>Delivery available</span></label><label className={styles.formField}><span>Country *</span><input className={styles.field} maxLength={2} onChange={(event) => patch({ countryCode: event.target.value.toUpperCase() })} placeholder="US, ZA, CA..." required value={draft.countryCode} /><small>Use the two-letter country code. Country is required for every listing, including remote listings.</small></label><label className={styles.formField}><span>State / region</span><input className={styles.field} onChange={(event) => patch({ region: event.target.value })} value={draft.region} /></label><label className={styles.formField}><span>City</span><input className={styles.field} onChange={(event) => patch({ city: event.target.value })} value={draft.city} /></label><label className={styles.formField}><span>Postal area</span><input className={styles.field} onChange={(event) => patch({ postalArea: event.target.value })} value={draft.postalArea} /></label><label className={`${styles.formField} ${styles.fullField}`}><span>Exact address</span><input className={styles.field} onChange={(event) => patch({ exactAddress: event.target.value })} value={draft.exactAddress} /><small><input checked={draft.showExactAddress} disabled={!draft.exactAddress} onChange={(event) => patch({ showExactAddress: event.target.checked })} type="checkbox" /> Show exact address publicly</small></label></div></section> : null}

        {/* Local blob previews cannot be routed through the Next image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {step === 3 ? <section className={styles.wizardSection}><div className={styles.formGrid}><label className={styles.formField}><span>Publish as</span><select className={styles.select} onChange={(event) => patch({ publisherKey: event.target.value })} value={draft.publisherKey}>{createState.publishers.map((publisher) => <option key={`${publisher.kind}:${publisher.id}`} value={`${publisher.kind}:${publisher.id}`}>{publisher.name} ({publisher.kind.toLowerCase()})</option>)}</select></label><label className={`${styles.checkboxField} ${styles.fullField}`}><input checked={draft.allowInAppMessages} onChange={(event) => patch({ allowInAppMessages: event.target.checked })} type="checkbox" /><span>Allow members to message me through Theta-Space</span></label><label className={styles.formField}><span>Contact email</span><input className={styles.field} onChange={(event) => patch({ email: event.target.value })} type="email" value={draft.email} /><small><input checked={draft.showEmail} disabled={!draft.email} onChange={(event) => patch({ showEmail: event.target.checked })} type="checkbox" /> Show on listing</small></label><label className={styles.formField}><span>Contact phone</span><input className={styles.field} onChange={(event) => patch({ phone: event.target.value })} type="tel" value={draft.phone} /><small><input checked={draft.showPhone} disabled={!draft.phone} onChange={(event) => patch({ showPhone: event.target.checked })} type="checkbox" /> Show on listing</small></label><label className={styles.formField}><span>Website</span><input className={styles.field} onChange={(event) => patch({ website: event.target.value })} placeholder="https://" type="url" value={draft.website} /><small><input checked={draft.showWebsite} disabled={!draft.website} onChange={(event) => patch({ showWebsite: event.target.checked })} type="checkbox" /> Show on listing</small></label><label className={`${styles.formField} ${styles.fullField}`}><span>Contact instructions</span><textarea className={styles.textarea} maxLength={500} onChange={(event) => patch({ contactInstructions: event.target.value })} placeholder="Best time to call, application instructions, pickup details..." value={draft.contactInstructions} /></label><section className={`${styles.mediaPanel} ${styles.fullField}`}><header><div><p className={styles.sectionLabel}>Photos</p><h2>Show the actual item, place, work, or service</h2></div><span>{uploads.length} / {createState.photoCap}</span></header><label className={`${styles.dropzone} ${dropActive ? styles.dropzoneActive : ""}`} onDragEnter={(event) => { event.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setDropActive(false); addFiles(event.dataTransfer.files); }}><ImagePlus aria-hidden="true" /><strong>Drop images here</strong><span>or choose images from your device</span><input accept="image/*" multiple onChange={(event) => event.target.files && addFiles(event.target.files)} type="file" /></label>{uploads.length ? <div className={styles.uploadGrid}>{uploads.map((item, index) => <article key={item.id}>{item.previewUrl ? <img alt="" src={item.previewUrl} /> : null}<span>{index === 0 ? "Primary" : `Image ${index + 1}`}</span>{item.status === "uploading" ? <progress max="100" value={item.progress} /> : null}<button aria-label={`Remove ${item.name}`} data-tooltip="Remove image." onClick={() => setUploads((current) => current.filter((candidate) => candidate.id !== item.id))} type="button"><Trash2 aria-hidden="true" /></button></article>)}</div> : null}</section></div></section> : null}
      </div>

      {error ? <div className={styles.formError} role="alert"><X aria-hidden="true" />{error}</div> : null}
      <footer className={styles.wizardFooter}><button className={styles.secondaryButton} disabled={step === 0 || isPending} onClick={() => setStep((current) => Math.max(0, current - 1))} type="button"><ArrowLeft aria-hidden="true" />Back</button><span>Step {step + 1} of {stepNames.length}</span><div className={styles.inlineActions}>{step === stepNames.length - 1 ? <>{!initialListing ? <button className={styles.secondaryButton} disabled={isPending} onClick={() => submit(false)} type="button"><Save aria-hidden="true" />Save draft</button> : null}<button className={styles.primaryButton} disabled={isPending} onClick={() => submit(true)} type="button"><Check aria-hidden="true" />{isPending ? "Saving..." : initialListing ? "Save changes" : "Publish listing"}</button></> : <button className={styles.primaryButton} onClick={nextStep} type="button">Continue<ArrowRight aria-hidden="true" /></button>}</div></footer>
    </div>
  );
}
