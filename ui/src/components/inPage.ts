/**
 * The mark of a list box that stands in the page at all times, as a line chart does, and does not
 * open over it as the list of a select does. The shortcuts of the app hold back while a list box
 * without it is in the document; one that carries it leaves them on (DESIGN.md, "Line chart").
 * Every list box that is always there carries it.
 */
export const IN_PAGE_ATTRIBUTE = "data-in-page";
