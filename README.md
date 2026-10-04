# Scan

Stocks page scans the top 1,000 names by volume, 100 per page. A name shows when it clears the loose 5/5 gate. Tight fundamentals are shown and are not a gate. Technical analysis is a week-plus buy, hold, or sell: price above the 50 and the 200, the 50 rising, RSI 30-70, no more than 8% above the 50, and reward to the 126-session high at least 1.5 times the distance back to the 50. Sell is price under the 50 and under the 200.

Confidence is the percent of 6 tight checks and 6 technical checks that pass. It is halved when an event is inside 5 days, or when a headline from the last 5 days mentions earnings, oil, guidance, a lawsuit, or a downgrade. A beat in the last 5 days adds 10. A miss subtracts 10. Size is high at 80 or above, medium from 50 to 79, and low under 50. An event inside 5 days, or that kind of headline, forces size to low. The row stays. A shareholder meeting about a month out does not change size.

Event shows the most recent earnings date or shareholder meeting that already happened. If Yahoo only has a future date, it shows the nearest one. The date comes from the quote summary when that feed answers, and from chart events.earnings when the chart feed includes one. A reported quarter is green on a beat and red on a miss. Meetings stay plain. Dates are not invented. If neither feed has a date, the cell is blank.

News is the latest Yahoo Finance story for that ticker: how many days ago, and the headline linked to the story URL. Headlines are not invented. If the news feed does not answer, the cell is blank.

Pages: https://sam-t-dev.github.io/finance-scan/?cat=Stocks

Worker: https://finance-scan-proxy.samtonin-registry.workers.dev/?cat=Stocks

The home board is four boxes: Scanners, Stocks, ETFs, Commodities. Under them are the 20 most traded names, ordered by share volume over the last 7 sessions when the chart feed answers, otherwise by the volume stored on the universe list. Arrows reverse that list of 20.

Each wide box shows the ticker and name, and the last price with today's change from that same chart feed. Green is up and red is down. Prices are left blank when the chart feed does not answer. The quote summary path is not used here, because the proxy returns 401 Invalid Crumb.

A stocks scan stays in this browser tab so Back and a stock page do not clear it. Search is the text field only and lists matches after 3 characters. A stock page has a zoomable chart, the loose, tight, technical, confidence, size, event, and news lines, and a Yahoo Finance link. When a recent headline is the kind that caps size, one line says so from the headline alone.

Screen only. Not advice.
