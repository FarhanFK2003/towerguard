/** Wording for the dashboard warning about stored records that failed validation. */
export function describeDamagedRecords(count: number): { title: string; detail: string } {
  if (count === 1) {
    return {
      title: "1 inspection record could not be displayed",
      detail:
        "It is stored in this browser but is incomplete or damaged, so it cannot be shown. It has not been changed or deleted.",
    };
  }
  return {
    title: `${count} inspection records could not be displayed`,
    detail:
      "They are stored in this browser but are incomplete or damaged, so they cannot be shown. They have not been changed or deleted.",
  };
}
