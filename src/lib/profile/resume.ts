export type ResumeBasics = {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website: string;
};

export type ResumeEntry = {
  organization: string;
  title: string;
  startDate: string;
  endDate: string;
  details: string;
};

export type ResumeProject = {
  name: string;
  role: string;
  url: string;
  details: string;
};

export type ResumeData = {
  basics: ResumeBasics;
  summary: string;
  experience: ResumeEntry[];
  education: ResumeEntry[];
  projects: ResumeProject[];
  skills: string[];
};

const EMPTY_ENTRY: ResumeEntry = {
  organization: "",
  title: "",
  startDate: "",
  endDate: "",
  details: "",
};

const EMPTY_PROJECT: ResumeProject = {
  name: "",
  role: "",
  url: "",
  details: "",
};

export function createEmptyResumeData(): ResumeData {
  return {
    basics: {
      fullName: "",
      headline: "",
      email: "",
      phone: "",
      location: "",
      website: "",
    },
    summary: "",
    experience: [{ ...EMPTY_ENTRY }],
    education: [{ ...EMPTY_ENTRY }],
    projects: [{ ...EMPTY_PROJECT }],
    skills: [],
  };
}

export function parseResumeJson(raw?: string | null): ResumeData {
  if (!raw) return createEmptyResumeData();
  try {
    const parsed = JSON.parse(raw) as Partial<ResumeData>;
    return sanitizeResumeData({
      basics: {
        fullName: String(parsed.basics?.fullName ?? ""),
        headline: String(parsed.basics?.headline ?? ""),
        email: String(parsed.basics?.email ?? ""),
        phone: String(parsed.basics?.phone ?? ""),
        location: String(parsed.basics?.location ?? ""),
        website: String(parsed.basics?.website ?? ""),
      },
      summary: String(parsed.summary ?? ""),
      experience: Array.isArray(parsed.experience) ? parsed.experience : [],
      education: Array.isArray(parsed.education) ? parsed.education : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    });
  } catch {
    return createEmptyResumeData();
  }
}

function cleanText(value: unknown, max = 4000): string {
  if (typeof value !== "string") return "";
  return value.replace(/[<>]/g, "").trim().slice(0, max);
}

export function sanitizeResumeData(value: ResumeData): ResumeData {
  const cleanEntry = (item: ResumeEntry): ResumeEntry => ({
    organization: cleanText(item.organization, 140),
    title: cleanText(item.title, 140),
    startDate: cleanText(item.startDate, 40),
    endDate: cleanText(item.endDate, 40),
    details: cleanText(item.details, 3000),
  });

  const cleanProject = (item: ResumeProject): ResumeProject => ({
    name: cleanText(item.name, 140),
    role: cleanText(item.role, 140),
    url: cleanText(item.url, 240),
    details: cleanText(item.details, 3000),
  });

  const experience = (Array.isArray(value.experience) ? value.experience : [])
    .slice(0, 20)
    .map(cleanEntry)
    .filter((row) => Object.values(row).some(Boolean));
  const education = (Array.isArray(value.education) ? value.education : [])
    .slice(0, 20)
    .map(cleanEntry)
    .filter((row) => Object.values(row).some(Boolean));
  const projects = (Array.isArray(value.projects) ? value.projects : [])
    .slice(0, 20)
    .map(cleanProject)
    .filter((row) => Object.values(row).some(Boolean));
  const skills = (Array.isArray(value.skills) ? value.skills : [])
    .slice(0, 40)
    .map((item) => cleanText(item, 80))
    .filter(Boolean);

  return {
    basics: {
      fullName: cleanText(value.basics?.fullName, 140),
      headline: cleanText(value.basics?.headline, 140),
      email: cleanText(value.basics?.email, 160),
      phone: cleanText(value.basics?.phone, 60),
      location: cleanText(value.basics?.location, 140),
      website: cleanText(value.basics?.website, 240),
    },
    summary: cleanText(value.summary, 4000),
    experience: experience.length > 0 ? experience : [{ ...EMPTY_ENTRY }],
    education: education.length > 0 ? education : [{ ...EMPTY_ENTRY }],
    projects: projects.length > 0 ? projects : [{ ...EMPTY_PROJECT }],
    skills,
  };
}

