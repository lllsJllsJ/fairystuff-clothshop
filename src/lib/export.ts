"use client"

import * as XLSX from "xlsx"

/** Export an array of flat records to a downloadable .xlsx file. */
export function exportToExcel(
  filename: string,
  sheetName: string,
  rows: Record<string, string | number>[]
) {
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31))
  XLSX.writeFile(workbook, `${filename}.xlsx`)
}

/** Trigger the browser print dialog (used for PDF export — Thai renders natively). */
export function printReport() {
  window.print()
}
