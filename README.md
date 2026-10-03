# Scan

Stocks page scans the top 1,000 names by volume, 100 per page. A name shows when it clears the loose 5/5 gate. Tight fundamentals are shown and are not a gate. Technical analysis is a week-plus buy, hold, or sell: price above the 50 and the 200, the 50 rising, RSI 30-70, no more than 8% above the 50, and reward to the 126-session high at least 1.5 times the distance back to the 50. Sell is price under the 50 and under the 200.

Confidence is the percent of 6 tight checks and 6 technical checks that pass. It is halved when the nearest earnings date is inside 5 days. A beat in the last 5 days adds 10. A miss subtracts 10. Size is high at 80 or above, medium from 50 to 79, and low under 50. An event inside 5 days forces size to low. A shareholder meeting about a month out does not change size.

Next event uses the Yahoo quote the scan already fetches. Upcoming earnings come from calendarEvents.earnings.earningsDate, or from earnings.earningsChart.earningsDate when that field is empty. A reported quarter uses reportedDate, green on a beat and red on a miss. A shareholder meeting is shown only when Yahoo includes that date. Dates are not invented.

Pages: https://sam-t-dev.github.io/finance-scan/?cat=Stocks

Worker: https://finance-scan-proxy.samtonin-registry.workers.dev/?cat=Stocks

The home board is four boxes: Scanners, Stocks, ETFs, Commodities. Under them are the 20 most traded names, ordered by share volume over the last 7 sessions when the chart feed answers, otherwise by the volume stored on the universe list. Arrows reverse that list of 20.

A stocks scan stays in this browser tab so Back and a stock page do not clear it. Search is the text field only and lists matches after 3 characters. A stock page has a zoomable chart, the loose, tight, technical, confidence, size, and next-event lines, and a Yahoo Finance link.

Screen only. Not advice.
