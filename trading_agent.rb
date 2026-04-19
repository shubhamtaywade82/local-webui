# Trading Agent Framework
# Demonstrates how agents orchestrate tools

class TradingAgent
  attr_accessor :memory, :current_position

  def initialize
    @memory = {}
    @current_position = nil
    @initialized = true
  end

  # Perception - Receive input and context
  def perceive(prompt)
    puts "\n=== AGENT PERCEIVED: #{prompt} ==="
    return self
  end

  # Planning - Decide which tool to call
  def plan(task_type, symbol = nil)
    case task_type.downcase
    when 'market_analysis', 'setup'
      @tool_sequence << :smc_analysis
    when 'trade_signal', 'analyze' 
      @tool_sequence << :smc_analysis
    when 'position_check', 'status'
      @tool_sequence << :get_position_state
    when 'send_alert'
      @tool_sequence << :telegram_alert
    else
      @tool_sequence << :unknown
    end
    puts "Planned action: #{@tool_sequence.last}"
    return self
  end

  # Action - Execute tool calls
  def act(symbol = nil, **kwargs)
    case
    when symbol && [:smc_analysis].include?(@tool_sequence.last)
      execute_smc(symbol, kwargs)
    when :telegram_alert.include?(@tool_sequence.last)
      send_telegram(**kwargs)
    when 'position_check'.include?(prompt.downcase)
      check_position
    else
      puts "Executing: #{@tool_sequence.last}"
    end
    return self
  end

  # Observation - Process results
  def observe(result)
    @memory[:last_result] = result
    puts "Received result from tool call"
    puts "Result details: #{result}"
    return self
  end

  # Reflection - Adjust strategy based on outcomes
  def reflect(success)
    if success
      puts "Strategy adjustment: Continue current approach"
    else
      puts "Strategy adjustment: Retry or switch tools"
    end
    return self
  end

  private

  def execute_smc(symbol, kwargs = {})
    htf = kwargs[:htf] || '1h'
    ltf = kwargs[:ltf] || '15m'
    puts "SMC Analysis: HTF=#{htf}, LTF=#{ltf}, Symbol=#{symbol}"
    return { status: :pending, message: 'Would call smc_analysis API' }
  end

  def send_telegram(**kwargs)
    puts "Telegram Alert: #{kwargs[:symbol]}/#{kwargs[:direction]} at #{kwargs[:entryRange]}"
    return { status: :sent, recipient: kwargs[:symbol] }
  end

  def check_position
    @current_position ||= nil
    return { position: @current_position || 'No active position' }
  end
end

# Example Usage
if __FILE__ == $0
  puts "" # Line break
  puts "=" * 50
  puts "RUBY TRADING AGENT DEMONSTRATION"
  puts "=" * 50

  agent = TradingAgent.new
  agent.memory[:pair] = 'B-ETH_USDT'

  puts "\n>>> Step 1: Agent Perception"
  agent.perceive("Perform market analysis for B-ETH-USDT")

  puts "\n>>> Step 2: Planning"
  agent.plan('market_analysis', 'B-ETH_USDT')

  puts "\n>>> Step 3: Action"
  result = agent.act('B-ETH_USDT', htftime: '1h', ltf: '15m')

  puts "\n>>> Step 4: Observation" 
  agent.observe(result)

  puts "\n>>> Step 5: Reflection"
  agent.reflect(true)

  puts "\n>>> Step 6: Position Check"
  pos = agent.check_position
  puts "Current position state: #{pos.inspect}"
end