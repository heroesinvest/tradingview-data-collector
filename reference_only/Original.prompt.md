<Role>
You are a PineScript Developer for TradingView indicators and JavaScript Developer for Browser Extensions with vast experience in Statistics for Financial Day Trading.
</Role> 

<Context>
We must generate signals for two distinct events: PreData and PostData
The output for those signals will be used for Fine-Tuning a numerical prognosticator using XGBoost

Pre-Data will generate signal with potential trades and will trigger a webhook with it's exit JSON Object as payload.
Post-Data is the future data once a Pre-Data signal is generated and will be used to teach the model about the expected results - make sure no future data leaks into Pre-Data.

Generally, a good opportunity is one that the max ATR is >= 4 and has been reached before the min ATR reached <= -1 ATR. 
Longs and Shorts show positive ATR for "positive" and negative ATR for "negative". 
1 ATR = 1 R-Multiple = US 300.00 

TradingView doesn't provide a good way to export our generated data.
We're using PineScript v6's (Developer) Pine Log with log.info() to log the PreData and PostData.
Once this info becames available, we collect/scrape this data using a browser extension.
This browser extension generate one JSON file per Symbol (PreData and PostData).
The file is an array of JSON Objects and follow this nomenclature: {Escaped Symbol Ticker}-{TimeFrame}-{firstSignal DateTime as yyyyMMdd-HHmm}-{LastSignal DateTime as yyyyMMdd-HHmm}.json

Symbol will be {Broker or Exchange}:{Ticker}. eg: BINANCE:BTCUSDT.P or CME_MINI:ES1!
For all in-TradingView uses, use the Symbol's full name.
For visuals and naming, use only the Ticker part of the Symbol and escape it. CME_MINI:ES1! => ES and BINANCE:BTCUSDT.P => BTCUSDT.P

Think harder and longer about about this request as a whole. 
Before you start any activies, you MUST generate a rubric of the objectives and at least 10 items (more detailed is better) for the Definition of Done (DoD).
Once you have that, iterate until you have achieved ALL the objectives and completed ALL the Definition of Done items. 

You must check online in case of any doubt about syntax or functions.
!IMPORTANT! TradingView has a computational and memory limitation per bar. You must ensure that your code will run without hitting those limits.
Add Git to this project.
Add this project to GitHub under my organization account (heroesinvest). I'm logged on GH on the terminal.
</Context>

<Output>
First of all, summarize my request.
Code in English. 
Give special attention to code syntax correctness.
Code must compile without errors every time.

Think and Chat in pt-BR.
</Output>

<Prompt>
I need of the following:
 - 1x TradingView Indicator that generates PreData and PostData entries into TradingView's (Developer) Pine Logs.
 - 1x Chromium Browser Extension that allows me to extract those entries into a JSON file


</Prompt>

<IndicatorRules>
    <IndicatorInputFields>
        - ATR Period: 200
        
        - SMA Length: 200
        - EMA Length: 20

        - Take Profit ATR Multiplier (RRR): 10
        
        - Enable Date Filter: Unchecked
            - Start Date: Default 2023-01-01 00:00
            - End Date: Default Today
        
        - Show Lines
            - Entry: Default Checked
            - Stop Loss: Default Checked 
            - Take Profit: Default Checked
        
        - Show ATR Size: Checked
        - ATR Size table location: bottom right

        - OHLCV Array Length: 200
        - Pullback Lookback Period: 20

        - Show Visuals: Checked
        - Show Entry: Checked
        - Show Stop Loss: Checked
        - Show Take Profit: Checked
        
        - Inputs in status line: Checked
        
        - Show Payload Log on Chart: Checked
        - Enable Alerts (used for Webhooks): Checked
    </IndicatorInputFields>
    <IndicatorVisuals>
        - SMA200 Purple line wheight 2
        - EMA20 Gray line wheight 2
        - One per entry
            - Entry Blue line wheight 1
            - Stop Loss Red line wheight 1
            - Take Profit Green line wheight 1
    </IndicatorVisuals>
    <GeneralRules>
        - Log entry (Pine Logs' log.info)
            - Whenever a new signal becomes available
            - Start PostData when new signal becomes available but just log it when exit condition is reached
        - Use only confirmed bars and closed bars
        - Do NOT trigger more than once per bar
    </GeneralRules>
    <PreData>
        <TradingViewIndicators>
        - SMA200
        - EMA20
        - 60 minute ATR200
        - Volume
        - Volume Delta
        </TradingViewIndicators>
        <Entry-Exit>
        - For longs, the close must be above the SMA200, cross down the EMA20 (bear candle) and the very next candle must be positive (bull candle). To avoid retriggering too often, you must wait 3 bars above the EMA20 before "restarting" the rules.
        - For shorts, the close must be below the SMA200, cross up the EMA20 (bull candle) and the very next candle must be negative (bear candle). To avoid retriggering too often, you must wait 3 bars below the EMA20 before "restarting" the rules.
        </Entry-Exit>
        <Output>
            JSON Object
                - Type = PreData
                - Entry Date Time ISO-8601 UTC
                - Symbol
                - TimeFrame (default 60m)
                - Side (long or short)
                - All data below must be normalized by ATR200 => the intention is to run this data through a Custom Fine-Tunning so we don't want it to learn the number itself but perhaps the relation to ATR
                - atr_percentage
                - sma200_distance
                - ema20_distance
                - ema_sma_spread
                - ema20_slope_5bar
                - sma200_slope_20bar
                - VolumeDelta_1bar
                - VolumeDelta_5bar
                - VolumeDelta_20bar
                - VolumeDelta_50bar
                - VolumeDelta_100bar
                - VolumeDelta_150bar
                - VolumeDelta_200bar
                - return_5bar
                - return_20bar
                - return_50bar
                - return_100bar
                - return_150bar
                - return_200bar
                - bar_range
                - bar_body
                - upper_wick
                - lower_wick
                - volume_ratio
                - volume_zscore
                - pullback_up
                - pullback_down
                - OHLCV for the last 200 bars
        </Output>
    </PreData>
    <PostData>
        <TradingViewIndicators>
            - 60 minute ATR200
        </TradingViewIndicators>
        <Entry>
            - For longs, the close must be above the SMA200, cross down the EMA20 (bear candle) and the very next candle must be positive (bull candle). To avoid retriggering too often, you must wait 3 bars above the EMA20 before "restarting" the rules.
            - For shorts, the close must be below the SMA200, cross up the EMA20 (bull candle) and the very next candle must be negative (bear candle). To avoid retriggering too often, you must wait 3 bars below the EMA20 before "restarting" the rules.
        </Entry>
        <Exit>
            - PostData Entries (JSON Objects) can only be logged into pine logs when it reaches it's exit. keep/accumulate it's data as per the rules below.
        
            - If a trade reaches -1 ATR it must be closed (exit).
            - If a trade reaches +10 ATR before it achieves -1 ATR it must be closed (exit).

            - Negative trades are the ones that achieve -1 ATR or less.
            - If a trade reaches -1 ATR and the max ATR at the same bar, ignores this bar's max ATR and consider it negative and close it (exit).

            - MaxATR is the Max positive ATR achieved before it reached -1 ATR or when it reached +10 ATR.
            - BarsUntliMaxATR and BarsUntliMinATR will be useful to understand if the trade achieved the goals (+ATR) before it achieved (-1 ATR)

            - Positive ATR is independent of long or short (going in favor of the position)
            - Negative ATR is independent of long or short (going against the position) 
        </Exit>
        <Output>                
            JSON Object
                - Type = PostData
                - Symbol
                - TimeFrame (default 60m)
                - Side (long or short)
                - MaxATR            
                - BarsUntlMaxATR
                - MinATR
                - BarsUntlMinATR
        </Output>
    </PostData>
</IndicatorRules>

<ChromiumBrowserExtensionRules>
    <InputFields>
        - Symbols: File Upload
        - Symbols loaded: 0

        - Start Date: Default 2023-01-01
        - End Date: Default Today
    </InputFields>  
    </DisplayFields>  
        - Data Collection Stopwatch: 00:00:00

        - Current Symbol: {Escaped Symbol's Ticker} (X/Y)
        - Symbol Stopwatch: 00:00:00

        - Current Date: yyyy-MM-dd (X/Y)
        - Date Stopwatch: 00:00:00
        - Total Log Entries: 000
        - Unique Log Entries: 000
        - Entries Current Date: 000
        - Last Logged: yyyy-MM-dd HH:mm

        - Status Messages
        - Messages
    </DisplayFields>  
    <Rules>
        - TradingView shows it's Pine Logs in a virtual list.
        - It only loads new items when the list is scrolled.
        - Usually the scroll is done by simulation the mouse wheel scroll event on the Virtual List ViewPort. !IMPORTANT!
        - Use the tradingview sample HTML for better understand of the virtual list/virtual DOM structure.

        - If no Symbols are selected, you will run it just for the current symbol/page.
        - If a file is uploaded, each line will contain one symbol and you must iterate through all symbols.
        
        - If no date (either start or end), just collect/scrape the current loadable data from the pine log virtual list.

        - If any date is selected, you must first, before iterating the date, get into replay mode.

        - If only one date is selected (either start or end), select the proper date in TradingView (rule below) and run it for the date.
        - If both dates are selected, you must do the following:
          - First run should be the initial date.
          - Second run should be last day of the year for the initial date.
          - Third run on, you must have the last day of the year for the subsequent year.
          - Last run, the end date.
        
        - The Chromium Browser Extension must be draggable, minimizable and resizable.
        - The Chromium Browser Extension must be initially positioned at the bottom right of the screen.'
    </Rules>
    <Critical>
        - TradingView's Pine Log is a virtual list.
        - Everytime you change dates, new list/list item are generated.
        - There will be overlap between them. You MUST have a strong dedupe logic to ensure no duplicated items will be collected.
        - The expectation is that the same number of items will be available for each Symbol; same number of preData and postData with the exception of the last one where the current postData Exit MAY not have been reached yet. No missing, no desync, no extra entries.
    </Critical>
    <Restrictions>
        - Do NOT change the URL!!! Changing the url restarts the browser extension and loses the current state.
        - Use TradingView Sample HTML as reference only but you must write your own code.
        - Use the previous TradingView PineScript as reference only but you must write your own code.
        - Use the previous Chromium Browser Extensions as reference only but you must write your own code.
    </Restrictions>
</ChromiumBrowserExtensionRules>