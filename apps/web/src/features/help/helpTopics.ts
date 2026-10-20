/**
 * Help topics. Every topic has a one-sentence explanation that is useful on its own; some also have an optional tour.
 * Steps point at real controls through `data-help` hooks, never at text. A tour is started only by the person, and it
 * never clicks, saves, publishes or changes anything for them.
 */
export type TourStep = { id: string; target: string; titleKey: string; bodyKey: string; missingKey: string };
export type HelpTopic = {
  id: "publish" | "instagram-organize" | "explorer";
  titleKey: string;
  helpKey: string;
  /** Selector that must be present for the tour to make sense; otherwise the topic explains what is needed first. */
  requires?: { selector: string; reasonKey: string };
  steps: TourStep[];
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "publish",
    titleKey: "help.topics.publish.title",
    helpKey: "help.topics.publish.help",
    steps: [
      { id: "preview", target: '[data-help="preview"]', titleKey: "help.topics.publish.previewTitle", bodyKey: "help.topics.publish.previewBody", missingKey: "help.missing.generic" },
      { id: "publish", target: '[data-help="publish"]', titleKey: "help.topics.publish.publishTitle", bodyKey: "help.topics.publish.publishBody", missingKey: "help.missing.publish" }
    ]
  },
  {
    id: "instagram-organize",
    titleKey: "help.topics.instagram.title",
    helpKey: "help.topics.instagram.help",
    requires: { selector: '[data-help="ig-tab-collections"]', reasonKey: "help.topics.instagram.requires" },
    steps: [
      { id: "tab", target: '[data-help="ig-tab-collections"]', titleKey: "help.topics.instagram.tabTitle", bodyKey: "help.topics.instagram.tabBody", missingKey: "help.missing.generic" },
      { id: "switch", target: '[data-help="ig-collection-switch"]', titleKey: "help.topics.instagram.switchTitle", bodyKey: "help.topics.instagram.switchBody", missingKey: "help.missing.openTab" },
      { id: "preview", target: '[data-help="preview"]', titleKey: "help.topics.instagram.previewTitle", bodyKey: "help.topics.instagram.previewBody", missingKey: "help.missing.generic" }
    ]
  },
  {
    id: "explorer",
    titleKey: "help.topics.explorer.title",
    helpKey: "help.topics.explorer.help",
    steps: [] // explanation only: a shortcut is a reference, and removing it never removes what it points at
  }
];
