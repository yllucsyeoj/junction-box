# Return the current date and time as a datetime value
@category datetime
export def "prim-date-now" []: nothing -> datetime {
    date now
}
