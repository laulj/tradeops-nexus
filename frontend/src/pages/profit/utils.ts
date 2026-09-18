import { type balanceResponse, views } from "@/types"

export const truncateHash = (hash: string, startLength: number = 4, endLength: number = 4): string => {
    if (!hash) return ""
    if (hash.length <= startLength + endLength) return hash

    return `${hash.substring(0, startLength)}...${hash.substring(hash.length - endLength)}`
}
const getCurrentWeek = (day: number, month: number) => {
    let weekly = (Math.floor(day / 7) + 1) * 7
    const isEvenMonth = month % 2 === 0 ? true : false

    if (month === 2) {
        if (weekly > 28) weekly = 28
    } else if (isEvenMonth) {
        let maxDate: number
        if (month > 7) {
            maxDate = 31
        } else {
            maxDate = 30
        }
        if (weekly > maxDate) weekly = maxDate
    } else {
        let maxDate: number
        if (month > 7) {
            maxDate = 30
        } else {
            maxDate = 31
        }
        if (weekly > maxDate) weekly = maxDate
    }
    return weekly
}

export const formatLeadingZero = (number: number) => {
    return ("0" + number.toString()).slice(-2)
}

export const formatBalanceByInterval = (type: keyof typeof views, _profit: balanceResponse[]) => {
    _profit = _profit.sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
    const _profitDaily: balanceResponse[] = []

    for (let _i = 0; _i < _profit.length; _i++) {
        const data = _profit[_i]
        const dateISOString = new Date(Number(data.timestamp)).toISOString().split("T")[0]
        const year = Number(dateISOString.split("-")[0])
        const month = Number(dateISOString.split("-")[1])
        const day = Number(dateISOString.split("-")[2])
        const week = getCurrentWeek(day, month)
        const quarter = Math.ceil(month / 4) * 4

        let isUnique = true
        for (let _j = 0; _j < _profitDaily.length; _j++) {
            const _dateISOString = _profitDaily[_j].timestamp
            const _year = Number(_dateISOString.split("-")[0])
            const _month = Number(_dateISOString.split("-")[1])
            const _day = Number(_dateISOString.split("-")[2])

            let condition: boolean = false
            if (type === views.Daily) condition = year === _year && month === _month && day === _day
            else if (type === views.Weekly) condition = year === _year && month === _month && day <= _day
            else if (type === views.Monthly) condition = year === _year && month === _month
            else if (type === views.Quarterly) condition = year === _year && month <= _month
            else if (type === views.Yearly) condition = year === _year

            if (condition) {
                if (data.amount > _profitDaily[_j].amount) _profitDaily[_j].amount = data.amount

                isUnique = false
                break
            }
        }

        let timestamp: string = ""

        if (isUnique) {
            if (type === views.Daily) timestamp = dateISOString
            else if (type === views.Weekly) {
                timestamp = year.toString() + "-" + formatLeadingZero(month) + "-" + formatLeadingZero(week)
            } else if (type === views.Monthly) timestamp = year.toString() + "-" + formatLeadingZero(month)
            else if (type === views.Quarterly) {
                timestamp = year.toString() + "-" + formatLeadingZero(quarter)
            } else if (type === views.Yearly) timestamp = year.toString()

            _profitDaily.push({
                key: "balance" + type + "_" + _profitDaily.length,
                address: data.address,
                timestamp,
                amount: data.amount,
            })
        }
    }

    return _profitDaily
}
