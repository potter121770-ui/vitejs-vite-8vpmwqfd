import React, { useState, useMemo, useEffect } from 'react';
import { Plus, PieChart, TrendingUp, DollarSign, List, Wallet, Settings, AlertCircle, Coins, Edit3, Calendar, Info, CreditCard, Calculator, Trash2, ChevronLeft, Save, ShieldCheck, CheckCircle, Coffee, Shield, Delete, X } from 'lucide-react';
import { 
  ResponsiveContainer, PieChart as RePieChart, Pie, Cell, Tooltip as RechartsTooltip 
} from 'recharts';

// --- Type Definitions ---
interface Transaction {
  id: number;
  date: string;
  category: string;
  amount: number;
  type: 'income' | 'expense';
  tag: 'need' | 'want' | 'income' | 'invest_monthly' | 'invest_cumulative';
  note: string;
  groupId?: string;
  investSource?: 'monthly' | 'cumulative';
}

interface Budgets {
  [key: string]: number;
}

interface StatsData {
  available: number;
  savings: number;
  emergencyCurrent: number;
  emergencyGoal: number;
  initialInvestable?: number;
}

interface MonthlyData {
  income: number;
  expense: number;
  actualInvested: number;
  need: number;
  want: number;
  categoryMap: { [key: string]: number };
}

interface ProcessedMonthData extends MonthlyData {
  netIncome: number;
  monthlyMaxInvestable: number;
  monthlyRemainingInvestable: number;
  cumulativeAddOnAvailable: number;
  deficitDeducted: number;
  accumulatedDeficit: number;
  savings: number;
  emergencyFund: number;
  divertedToEmergency: number;
  emergencyGoal: number;
  budgetSource: string;
}

// --- 色彩配置 ---
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

// --- 初始資料 ---
const INITIAL_TRANSACTIONS: Transaction[] = [];
const INITIAL_BUDGETS: Budgets = {};
const INITIAL_STATS_DATA: StatsData = {
  available: 0, 
  savings: 0,
  emergencyCurrent: 0, 
  emergencyGoal: 60000,
  initialInvestable: 0 
};

const CATEGORIES = [
  '房租', '飲食', '交通', '健身', '旅遊', '娛樂', '生活雜費', '教育', '醫療', '收入'
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // --- iOS App-Like Behavior Hook ---
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content');

    const preventPinch = (e: Event) => {
      e.preventDefault();
    };

    document.addEventListener('gesturestart', preventPinch, { passive: false });

    return () => {
      document.removeEventListener('gesturestart', preventPinch);
    };
  }, []);

  // --- State Initialization ---
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('yupao_transactions_v2');
      return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
    } catch (e) {
      return INITIAL_TRANSACTIONS;
    }
  });
  
  const [initialStats, setInitialStats] = useState<StatsData>(() => {
    try {
      const saved = localStorage.getItem('yupao_stats_v2');
      const parsed = saved ? JSON.parse(saved) : INITIAL_STATS_DATA;
      return { ...INITIAL_STATS_DATA, ...parsed };
    } catch (e) {
      return INITIAL_STATS_DATA;
    }
  });

  const [budgets, setBudgets] = useState<Budgets>(() => {
    try {
      const saved = localStorage.getItem('yupao_budgets_v2');
      return saved ? JSON.parse(saved) : INITIAL_BUDGETS;
    } catch (e) {
      return INITIAL_BUDGETS;
    }
  });

  useEffect(() => {
    localStorage.setItem('yupao_transactions_v2', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('yupao_stats_v2', JSON.stringify(initialStats));
  }, [initialStats]);

  useEffect(() => {
    localStorage.setItem('yupao_budgets_v2', JSON.stringify(budgets));
  }, [budgets]);


  const [deleteModal, setDeleteModal] = useState<{ show: boolean; id: number | null }>({ show: false, id: null });
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));

  // --- Calculator State ---
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState('0');

  const availableMonths = useMemo(() => {
    const months = new Set(transactions.map(t => t.date.substring(0, 7)));
    months.add(new Date().toISOString().substring(0, 7));
    return Array.from(months).sort().reverse(); 
  }, [transactions]);

  useEffect(() => {
    if (!availableMonths.includes(selectedMonth) && availableMonths.length > 0) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  // 表單狀態
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '飲食',
    amount: '',
    note: '',
    tag: 'need' as 'need' | 'want' | 'income', 
    type: 'expense' as 'income' | 'expense',
    isInstallment: false, 
    installmentCount: 3,  
    installmentCalcType: 'total',
    perMonthInput: '',
    investSource: 'monthly' as 'monthly' | 'cumulative'
  });
  
  const [editingId, setEditingId] = useState<number | null>(null);

  // --- Calculator Logic ---
  const handleCalcInput = (key: string) => {
    if (key === 'AC') {
        setCalcDisplay('0');
    } else if (key === 'DEL') {
        setCalcDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
    } else if (key === '=') {
        try {
            // eslint-disable-next-line no-new-func
            const result = new Function('return ' + calcDisplay.replace(/[^0-9+\-*/.]/g, ''))();
            setCalcDisplay(String(result));
        } catch (e) {
            setCalcDisplay('Error');
        }
    } else if (key === 'OK') {
        try {
            // eslint-disable-next-line no-new-func
            const result = new Function('return ' + calcDisplay.replace(/[^0-9+\-*/.]/g, ''))();
            const finalVal = Math.floor(Number(result));
            setFormData(prev => ({ ...prev, amount: String(finalVal) }));
            setIsCalculatorOpen(false);
        } catch (e) {
            setCalcDisplay('Error');
        }
    } else {
        setCalcDisplay(prev => {
            if (prev === '0' && !['+', '-', '*', '/', '.'].includes(key)) return key;
            if (prev === 'Error') return key;
            return prev + key;
        });
    }
  };

  const openCalculator = () => {
      setCalcDisplay(formData.amount || '0');
      setIsCalculatorOpen(true);
  };

  // --- 核心邏輯計算 ---
  const stats = useMemo(() => {
    let monthlyRawData: { [key: string]: MonthlyData } = {};
    
    availableMonths.forEach(m => {
        monthlyRawData[m] = { 
          income: 0, 
          expense: 0, 
          actualInvested: 0, 
          need: 0, 
          want: 0, 
          categoryMap: {} 
        };
    });

    transactions.forEach(t => {
      const monthKey = t.date.substring(0, 7);
      if (!monthlyRawData[monthKey]) {
          monthlyRawData[monthKey] = { income: 0, expense: 0, actualInvested: 0, need: 0, want: 0, categoryMap: {} };
      }

      if (t.category === '收入') {
        monthlyRawData[monthKey].income += Number(t.amount);
      } else if (t.category === '投資') {
         monthlyRawData[monthKey].actualInvested += Number(t.amount);
         
         if (t.tag === 'invest_monthly') {
             monthlyRawData[monthKey].expense += Number(t.amount);
         }
      } else {
        const amount = Number(t.amount);
        monthlyRawData[monthKey].expense += amount;
        
        if (t.tag === 'need') monthlyRawData[monthKey].need += amount;
        else if (t.tag === 'want') monthlyRawData[monthKey].want += amount;

        if (!monthlyRawData[monthKey].categoryMap[t.category]) monthlyRawData[monthKey].categoryMap[t.category] = 0;
        monthlyRawData[monthKey].categoryMap[t.category] += amount;
      }
    });

    const sortedMonthsAsc = Object.keys(monthlyRawData).sort(); 
    
    let accumulatedDeficit = 0;
    let cumulativeInvestable = initialStats.available; 
    let cumulativeSavings = initialStats.savings;
    let runningEmergencyFund = initialStats.emergencyCurrent || 0; 
    const emergencyGoal = initialStats.emergencyGoal || 60000;
    
    let carryOverBudget = initialStats.initialInvestable || 0; 
    let processedMonthsData: { [key: string]: ProcessedMonthData } = {};

    sortedMonthsAsc.forEach(month => {
      const { income, expense, actualInvested, categoryMap, need, want } = monthlyRawData[month];
      const netIncome = income - expense;
      
      let monthlyMaxInvestable = carryOverBudget; 
      
      let surplusForNextMonth = 0; 
      let currentMonthSavingsAddon = 0; 
      let deficitDeducted = 0;
      let divertedToEmergency = 0; 
      
      if (netIncome > 0) {
        if (netIncome >= accumulatedDeficit) {
           // 1. 優先償還累積赤字
           deficitDeducted = accumulatedDeficit;
           let realSurplus = netIncome - accumulatedDeficit;
           accumulatedDeficit = 0; 
           
           // 2. 優先填補緊急預備金 (新邏輯)
           // 直接從淨盈餘 (realSurplus) 中扣除，不佔用後續的投資/儲蓄比例
           const emergencyGap = Math.max(0, emergencyGoal - runningEmergencyFund);
           
           if (emergencyGap > 0) {
               divertedToEmergency = Math.min(realSurplus, emergencyGap);
               realSurplus -= divertedToEmergency;
               runningEmergencyFund += divertedToEmergency;
           }

           // 3. 剩餘盈餘進行 90/10 分配
           if (realSurplus > 0) {
               surplusForNextMonth = realSurplus * 0.9;
               currentMonthSavingsAddon = realSurplus * 0.1;
           } else {
               surplusForNextMonth = 0;
               currentMonthSavingsAddon = 0;
           }

        } else {
           deficitDeducted = netIncome;
           accumulatedDeficit -= netIncome;
           surplusForNextMonth = 0;
           currentMonthSavingsAddon = 0; 
        }
      } else {
        accumulatedDeficit += Math.abs(netIncome);
        surplusForNextMonth = 0;
        currentMonthSavingsAddon = 0;
      }

      cumulativeSavings += currentMonthSavingsAddon;
      
      cumulativeInvestable = cumulativeInvestable + monthlyMaxInvestable - actualInvested;
      carryOverBudget = surplusForNextMonth;

      processedMonthsData[month] = {
          income,
          expense,
          netIncome,
          categoryMap,
          actualInvested,
          need, 
          want, 
          monthlyMaxInvestable,
          monthlyRemainingInvestable: monthlyMaxInvestable - actualInvested,
          cumulativeAddOnAvailable: cumulativeInvestable + surplusForNextMonth, 
          deficitDeducted, 
          accumulatedDeficit, 
          savings: cumulativeSavings,
          emergencyFund: runningEmergencyFund,
          divertedToEmergency, 
          emergencyGoal,
          budgetSource: monthlyMaxInvestable > 0 ? 'based_on_prev_surplus' : 'prev_month_deficit_or_zero'
      };
    });

    const currentData = processedMonthsData[selectedMonth] || {
        income: 0, expense: 0, netIncome: 0, categoryMap: {}, actualInvested: 0, need: 0, want: 0,
        monthlyMaxInvestable: carryOverBudget,
        monthlyRemainingInvestable: carryOverBudget - 0, 
        cumulativeAddOnAvailable: cumulativeInvestable,
        deficitDeducted: 0, accumulatedDeficit: 0, savings: cumulativeSavings, 
        emergencyFund: runningEmergencyFund, divertedToEmergency: 0, emergencyGoal: emergencyGoal,
        budgetSource: 'no_data'
    };

    const pieData = Object.keys(currentData.categoryMap).map(key => ({
      name: key,
      value: currentData.categoryMap[key]
    }));

    return {
      dashboard: { ...currentData, pieData },
      investment: currentData,
    };
  }, [transactions, initialStats, selectedMonth, availableMonths]);

  // --- 操作功能 ---
  const openAddMode = () => {
    setEditingId(null);
    setFormData({ 
      date: new Date().toISOString().split('T')[0], 
      category: '飲食', 
      amount: '', 
      note: '', 
      tag: 'need', 
      type: 'expense',
      isInstallment: false, 
      installmentCount: 3,  
      installmentCalcType: 'total',
      perMonthInput: '',
      investSource: 'monthly' 
    });
    setActiveTab('form');
  };

  const openEditMode = (trans: Transaction) => {
    setEditingId(trans.id);
    const source = trans.category === '投資' 
                   ? (trans.tag === 'invest_cumulative' ? 'cumulative' : 'monthly') 
                   : 'monthly';

    setFormData({ 
      date: trans.date, 
      category: trans.category, 
      amount: trans.amount.toString(), 
      note: trans.note.replace(/\(\d+\/\d+\)$/, '').trim(), 
      tag: trans.tag as 'need' | 'want' | 'income', 
      type: trans.type,
      isInstallment: false, 
      installmentCount: 3,
      installmentCalcType: 'total',
      perMonthInput: '',
      investSource: source
    });
    setActiveTab('form');
  };

  const handleFabClick = () => {
    if (activeTab === 'form' && !editingId) {
        setActiveTab('dashboard');
    } else {
        openAddMode();
    }
  };

  const handleSave = () => {
    if (!formData.amount) return;
    
    let finalTag: 'need' | 'want' | 'income' | 'invest_monthly' | 'invest_cumulative';
    if (formData.category === '收入') {
      finalTag = 'income';
    } else if (formData.category === '投資') {
      finalTag = formData.investSource === 'cumulative' ? 'invest_cumulative' : 'invest_monthly';
    } else {
      finalTag = formData.tag;
    }

    if (editingId) {
      setTransactions(transactions.map(t => t.id === editingId ? { ...t, ...formData, tag: finalTag, amount: Number(formData.amount) } : t));
      setActiveTab('history');
      return;
    } 
    
    const baseId = transactions.length > 0 ? Math.max(...transactions.map(t => t.id)) + 1 : 1;
    const totalAmount = Number(formData.amount);
    
    if (formData.isInstallment && formData.type === 'expense' && formData.category !== '投資' && formData.installmentCount > 1) {
       const newTransactions: Transaction[] = [];
       const count = Math.round(formData.installmentCount);
       const perMonthAmount = Math.floor(totalAmount / count);
       const remainder = totalAmount - (perMonthAmount * count);
       const startDate = new Date(formData.date);
       const startDay = startDate.getDate();
        
       for (let i = 0; i < count; i++) {
          const currentAmount = i === 0 ? perMonthAmount + remainder : perMonthAmount; 
          const nextDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, startDay);
          if (nextDate.getDate() !== startDay) nextDate.setDate(0); 
          const dateStr = nextDate.toISOString().split('T')[0];
          
          newTransactions.push({
             id: baseId + i,
             ...formData,
             date: dateStr,
             amount: currentAmount,
             note: `${formData.note} (${i + 1}/${count})`,
             groupId: `group_${baseId}`,
             tag: finalTag, 
          });
       }
       setTransactions([...newTransactions, ...transactions]);
    } else {
       const item: Transaction = { id: baseId, ...formData, tag: finalTag, amount: totalAmount };
       setTransactions([item, ...transactions]);
    }
    
    setActiveTab('history');
  };

  const requestDelete = (e: React.MouseEvent, id: number) => { e.stopPropagation(); setDeleteModal({ show: true, id }); };
  const confirmDelete = () => {
    if (deleteModal.id) {
      setTransactions(transactions.filter(t => t.id !== deleteModal.id));
      if (activeTab === 'form' && editingId === deleteModal.id) setActiveTab('history');
    }
    setDeleteModal({ show: false, id: null });
  };
  const updateBudget = (category: string, value: string) => { setBudgets(prev => ({ ...prev, [category]: Number(value) })); };

  // --- Views ---

  const renderDashboardView = () => {
    const { emergencyFund, emergencyGoal } = stats.dashboard;
    const emergencyProgress = Math.min((emergencyFund / emergencyGoal) * 100, 100);
    const isEmergencyFull = emergencyFund >= emergencyGoal;

    return (
      <div className="space-y-5">
        <div className="flex justify-between items-center bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 text-gray-700 font-bold">
                <Calendar className="w-5 h-5 text-blue-600" />
                <span className="text-base">{selectedMonth}</span>
            </div>
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-gray-50 border border-gray-200 text-gray-700 text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none"
            >
              {availableMonths.map(m => ( <option key={m} value={m}>{m}</option> ))}
            </select>
        </div>

        {/* 緊急預備金卡片 */}
        <div className={`p-5 rounded-3xl text-white shadow-lg relative overflow-hidden transition-all ${isEmergencyFull ? 'bg-gradient-to-r from-emerald-500 to-teal-600' : 'bg-gradient-to-r from-slate-700 to-slate-800'}`}>
           <div className="absolute right-[-20px] top-[-20px] opacity-20">
              <ShieldCheck className="w-32 h-32" />
           </div>
           <div className="relative z-10">
              <div className="flex justify-between items-start mb-2">
                 <div>
                    <h2 className="text-sm font-bold opacity-90 flex items-center gap-2"><Shield className="w-4 h-4" /> 緊急預備金</h2>
                    <p className="text-2xl font-bold mt-1">${Math.floor(emergencyFund).toLocaleString()} <span className="text-xs opacity-60 font-normal">/ ${emergencyGoal.toLocaleString()}</span></p>
                 </div>
                 {isEmergencyFull ? (
                    <span className="bg-white/20 px-2 py-1 rounded text-xs font-bold">已達標</span>
                 ) : (
                    <span className="bg-orange-500 px-2 py-1 rounded text-xs font-bold animate-pulse">補水中</span>
                 )}
              </div>
              
              <div className="w-full bg-black/20 rounded-full h-2.5 mb-1">
                 <div className={`h-2.5 rounded-full transition-all duration-1000 ${isEmergencyFull ? 'bg-white' : 'bg-orange-400'}`} style={{ width: `${emergencyProgress}%` }}></div>
              </div>
              <p className="text-[10px] opacity-70 text-right">
                 {isEmergencyFull ? '資金將正常流向投資與儲蓄' : '優先級：當月淨收支 > 補滿此池'}
              </p>
           </div>
        </div>

        {/* 淨收支卡片 (縮小版) */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div>
            <p className="text-xs text-gray-500">本月淨收支</p>
            <p className={`text-2xl font-bold ${stats.dashboard.netIncome >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
              {stats.dashboard.netIncome >= 0 ? '+' : ''}{stats.dashboard.netIncome.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
             <p className="text-xs text-green-600">收入 +{stats.dashboard.income.toLocaleString()}</p>
             <p className="text-xs text-red-500">支出 -{stats.dashboard.expense.toLocaleString()}</p>
          </div>
        </div>

        {/* Need vs Want 區塊 */}
        <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between h-24 relative overflow-hidden">
               <div className="relative z-10">
                 <div className="flex items-center gap-1.5 mb-1 text-gray-500">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span className="text-xs font-bold">需要 (Need)</span>
                 </div>
                 <p className="text-lg font-bold text-gray-800">${stats.dashboard.need.toLocaleString()}</p>
               </div>
               <div className="h-1.5 w-full bg-gray-100 rounded-full mt-1 overflow-hidden relative z-10">
                   <div className="h-full bg-gray-500 rounded-full" style={{ width: `${stats.dashboard.expense > 0 ? (stats.dashboard.need / stats.dashboard.expense * 100) : 0}%` }}></div>
               </div>
            </div>
            
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between h-24 relative overflow-hidden">
               <div className="relative z-10">
                 <div className="flex items-center gap-1.5 mb-1 text-yellow-600">
                    <Coffee className="w-3.5 h-3.5" />
                    <span className="text-xs font-bold">想要 (Want)</span>
                 </div>
                 <p className="text-lg font-bold text-gray-800">${stats.dashboard.want.toLocaleString()}</p>
               </div>
               <div className="h-1.5 w-full bg-yellow-50 rounded-full mt-1 overflow-hidden relative z-10">
                   <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${stats.dashboard.expense > 0 ? (stats.dashboard.want / stats.dashboard.expense * 100) : 0}%` }}></div>
               </div>
            </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
             <h3 className="font-bold text-gray-800 flex items-center">
               <PieChart className="w-5 h-5 mr-2 text-blue-500" />
               預算執行狀況
             </h3>
             <button onClick={() => setActiveTab('settings')} className="text-xs text-blue-600 font-medium">調整預算</button>
          </div>
          
          {Object.entries(budgets).filter(([_, budget]) => (budget as number) > 0).map(([cat, budget]) => {
            const currentMonthTransactions = transactions.filter(t => t.date.startsWith(selectedMonth));
            const spent = currentMonthTransactions.filter(t => t.category === cat).reduce((sum, t) => sum + Number(t.amount), 0);
            const percent = Math.min((spent / (budget as number)) * 100, 100);
            return (
              <div key={cat} className="mb-4 last:mb-0">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{cat}</span>
                  <span className="text-gray-500">{spent.toLocaleString()} / {(budget as number).toLocaleString()}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${percent > 90 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${percent}%` }}></div>
                </div>
              </div>
            );
          })}
          {Object.values(budgets).every(b => b === 0) && <p className="text-sm text-gray-400 text-center py-2">所有預算皆未設定，請至設定頁面新增</p>}
        </div>

        {/* 修正圓餅圖區塊：自適應高度並加入 Legend */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 h-auto">
          <h3 className="font-bold text-gray-800 mb-4">支出分類佔比 ({selectedMonth})</h3>
          {stats.dashboard.pieData.length > 0 ? (
            <>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                        <Pie 
                            data={stats.dashboard.pieData} 
                            cx="50%" 
                            cy="50%" 
                            innerRadius={60} 
                            outerRadius={80} 
                            paddingAngle={5} 
                            dataKey="value"
                            // 移除 label 以避免重疊
                        >
                        {stats.dashboard.pieData.map((entry, index) => ( <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} /> ))}
                        </Pie>
                        <RechartsTooltip />
                    </RePieChart>
                    </ResponsiveContainer>
                </div>
                
                {/* 新增：圓餅圖下方的分類列表 (Legend) */}
                <div className="mt-4 space-y-3">
                    {stats.dashboard.pieData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                        <span className="text-gray-600 font-medium">{entry.name}</span>
                        </div>
                        <div className="font-bold text-gray-800">
                            ${entry.value.toLocaleString()} 
                            <span className="text-xs text-gray-400 font-normal ml-1">
                                ({stats.dashboard.expense > 0 ? ((entry.value / stats.dashboard.expense) * 100).toFixed(1) : 0}%)
                            </span>
                        </div>
                    </div>
                    ))}
                </div>
            </>
          ) : (
              <div className="h-32 flex items-center justify-center text-gray-400 text-sm">本月尚無支出紀錄</div>
          )}
        </div>
      </div>
    );
  }

  const renderFormView = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
         <button onClick={() => setActiveTab('history')} className="p-2 -ml-2 text-gray-500"><ChevronLeft /></button>
         <h3 className="font-bold text-xl text-gray-800">{editingId ? '編輯紀錄' : '新增紀錄'}</h3>
      </div>
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 pb-20"> {/* pb-20 for calculator space if needed */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setFormData({...formData, type: 'expense', category: '飲食', investSource: 'monthly'})} className={`flex-1 py-3 rounded-xl text-sm font-bold transition ${formData.type === 'expense' ? 'bg-red-100 text-red-600 ring-2 ring-red-200' : 'bg-gray-50 text-gray-400'}`}>支出</button>
            <button onClick={() => setFormData({...formData, type: 'income', category: '收入', tag: 'income', investSource: 'monthly'})} className={`flex-1 py-3 rounded-xl text-sm font-bold transition ${formData.type === 'income' ? 'bg-green-100 text-green-600 ring-2 ring-green-200' : 'bg-gray-50 text-gray-400'}`}>收入</button>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block font-medium">日期 (或首期繳款日)</label>
              <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-gray-50 rounded-xl p-3 text-base focus:outline-blue-500 font-medium" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block font-medium">金額 {formData.isInstallment && '(總額)'}</label>
              <div className="relative">
                <input 
                  type="text" // Change to text for calculator display compatibility if using directly, but we use readOnly
                  placeholder="0" 
                  value={formData.amount} 
                  readOnly // Important: prevent system keyboard
                  onClick={openCalculator}
                  className={`w-full bg-gray-50 rounded-xl p-3 text-base focus:outline-blue-500 font-medium cursor-pointer ${formData.installmentCalcType === 'monthly' && formData.isInstallment ? 'bg-gray-100 text-gray-500' : ''}`} 
                />
                <Calculator className="absolute right-3 top-3.5 text-gray-400 w-5 h-5 pointer-events-none" />
              </div>
            </div>
          </div>
           
          {formData.type === 'expense' && formData.category !== '投資' && !editingId && (
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 transition-all">
                 <label className="flex items-center justify-between cursor-pointer mb-2">
                    <div className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-blue-600" />
                        <span className="font-bold text-blue-800 text-sm">分期付款自動生成</span>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={formData.isInstallment} onChange={(e) => setFormData({...formData, isInstallment: e.target.checked})} />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </div>
                 </label>
                  
                 {formData.isInstallment && (
                    <div className="animate-in slide-in-from-top-2 pt-2 border-t border-blue-200">
                        <div className="flex bg-blue-100/50 rounded-lg p-1 mb-3">
                            <button 
                                onClick={() => setFormData(prev => ({ ...prev, installmentCalcType: 'total' }))}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${formData.installmentCalcType === 'total' ? 'bg-white text-blue-600 shadow-sm' : 'text-blue-400 hover:text-blue-500'}`}
                            >
                                輸入總額 (算每期)
                            </button>
                            <button 
                                onClick={() => {
                                    const currentPerMonth = formData.amount && formData.installmentCount ? Math.floor(Number(formData.amount) / formData.installmentCount) : '';
                                    setFormData(prev => ({ ...prev, installmentCalcType: 'monthly', perMonthInput: currentPerMonth.toString() }));
                                }}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${formData.installmentCalcType === 'monthly' ? 'bg-white text-blue-600 shadow-sm' : 'text-blue-400 hover:text-blue-500'}`}
                            >
                                輸入每期 (算總額)
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-blue-600 mb-1 block font-bold">分期期數 (月)</label>
                                <input 
                                    type="number" 
                                    min="2"
                                    max="36"
                                    value={formData.installmentCount} 
                                    onChange={e => {
                                        const count = Number(e.target.value);
                                        if (formData.installmentCalcType === 'monthly' && formData.perMonthInput) {
                                            setFormData({
                                                ...formData,
                                                installmentCount: count,
                                                amount: (Number(formData.perMonthInput) * count).toString()
                                            });
                                        } else {
                                            setFormData({...formData, installmentCount: count});
                                        }
                                    }} 
                                    className="w-full bg-white border border-blue-200 rounded-lg p-2 text-base text-center font-bold text-blue-800 focus:outline-blue-500" 
                                />
                            </div>
                            
                            <div>
                                <label className="text-xs text-blue-600 mb-1 block font-bold">每期金額</label>
                                {formData.installmentCalcType === 'total' ? (
                                    <div className="w-full bg-blue-100 rounded-lg p-2 text-sm text-center font-bold text-blue-800 flex items-center justify-center h-[38px]">
                                        <Calculator className="w-3 h-3 mr-1 opacity-50" />
                                        {formData.amount ? Math.floor(Number(formData.amount) / formData.installmentCount).toLocaleString() : 0}
                                    </div>
                                ) : (
                                    <input 
                                        type="number"
                                        placeholder="輸入每期"
                                        value={formData.perMonthInput}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setFormData({
                                                ...formData,
                                                perMonthInput: val,
                                                amount: val ? (Number(val) * formData.installmentCount).toString() : '' 
                                            });
                                        }}
                                        className="w-full bg-white border border-blue-200 rounded-lg p-2 text-base text-center font-bold text-blue-800 focus:outline-blue-500"
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                 )}
              </div>
          )}

          <div>
            <label className="text-xs text-gray-500 mb-1 block font-medium">分類</label>
            <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full bg-gray-50 rounded-xl p-3 text-base focus:outline-blue-500">
              {formData.type === 'income' ? <option value="收入">收入</option> : <>{CATEGORIES.filter(c => c !== '收入').map(c => <option key={c} value={c}>{c}</option>)}<option value="投資">投資</option></>}
            </select>
          </div>
          
          {formData.type === 'expense' && formData.category === '投資' && (
             <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 flex flex-col gap-2">
                <p className="text-xs font-bold text-indigo-700">選擇資金來源</p>
                <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
                    <input 
                        type="radio" 
                        name="investSource" 
                        checked={formData.investSource === 'monthly'} 
                        onChange={() => setFormData({...formData, investSource: 'monthly'})} 
                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" 
                    />
                    <div className="flex flex-col">
                        <span className={formData.investSource === 'monthly' ? 'font-bold text-indigo-800' : ''}>當月新增可投資額度</span>
                        <span className="text-xs text-gray-500">計入本月淨支出。</span>
                    </div>
                </label>
                <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
                    <input 
                        type="radio" 
                        name="investSource" 
                        checked={formData.investSource === 'cumulative'} 
                        onChange={() => setFormData({...formData, investSource: 'cumulative'})} 
                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" 
                    />
                    <div className="flex flex-col">
                        <span className={formData.investSource === 'cumulative' ? 'font-bold text-indigo-800' : ''}>歷史累積加碼資金</span>
                        <span className="text-xs text-gray-500">直接使用累積水庫資金，不影響本月淨支出。</span>
                    </div>
                </label>
             </div>
          )}

          {formData.type === 'expense' && formData.category !== '投資' && (
            <div className="bg-gray-50 p-3 rounded-xl flex gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer flex-1"><input type="radio" name="tag" checked={formData.tag === 'need'} onChange={() => setFormData({...formData, tag: 'need'})} className="w-4 h-4 text-blue-600" /><span className={formData.tag === 'need' ? 'font-bold text-blue-600' : ''}>需要 (Need)</span></label>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer flex-1"><input type="radio" name="tag" checked={formData.tag === 'want'} onChange={() => setFormData({...formData, tag: 'want'})} className="w-4 h-4 text-blue-600" /><span className={formData.tag === 'want' ? 'font-bold text-blue-600' : ''}>想要 (Want)</span></label>
            </div>
          )}
          <input type="text" placeholder="備註" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} className="w-full bg-gray-50 rounded-xl p-3 text-base focus:outline-blue-500" />
          <div className="flex gap-3 pt-2">
             {editingId && <button onClick={(e) => requestDelete(e, editingId)} className="flex-1 bg-red-50 text-red-500 py-3 rounded-xl font-bold hover:bg-red-100 transition flex items-center justify-center gap-2"><Trash2 className="w-5 h-5" /> 刪除</button>}
            <button onClick={handleSave} className={`flex-[2] text-white py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 ${editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-black hover:bg-gray-800'}`}><Save className="w-5 h-5" /> {editingId ? '儲存修改' : '新增紀錄'}</button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHistoryView = () => {
    const groupedTransactions = transactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .reduce((groups: { [key: string]: Transaction[] }, t) => {
        const date = new Date(t.date);
        const key = `${date.getFullYear()}年${date.getMonth() + 1}月`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
        return groups;
      }, {});

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-end px-2">
          <h3 className="font-bold text-2xl text-gray-800">歷史紀錄</h3>
          <p className="text-xs text-gray-400 mb-1">共 {transactions.length} 筆</p>
        </div>
        {Object.entries(groupedTransactions).map(([groupName, groupItems]) => (
          <div key={groupName} className="space-y-2">
            <h4 className="text-sm font-bold text-gray-500 pl-2 bg-gray-100 py-1 rounded-lg inline-block">{groupName}</h4>
            <div className="space-y-3">
              {(groupItems as Transaction[]).map(t => (
                <div key={t.id} onClick={() => openEditMode(t)} className="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center active:scale-[0.98] transition cursor-pointer hover:shadow-md group">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${t.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {t.category === '投資' ? <TrendingUp className="w-6 h-6" /> : <DollarSign className="w-6 h-6" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 text-base truncate">{t.category}</p>
                      <p className="text-xs text-gray-400 truncate">{t.date} • {t.note || '無備註'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className={`font-bold text-lg ${t.type === 'income' ? 'text-green-600' : 'text-gray-800'}`}>{t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString()}</p>
                        {t.category === '投資' ? (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.tag === 'invest_cumulative' ? 'bg-indigo-100 text-indigo-600' : 'bg-green-100 text-green-600'}`}>
                            {t.tag === 'invest_cumulative' ? '累積金' : '當月'}
                          </span>
                        ) : (
                          t.type === 'expense' && <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.tag === 'need' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-600'}`}>{t.tag === 'need' ? '需要' : '想要'}</span>
                        )}
                    </div>
                    <button onClick={(e) => requestDelete(e, t.id)} className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition"><Trash2 className="w-5 h-5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {transactions.length === 0 && <div className="text-center py-20 text-gray-400"><p>目前沒有紀錄</p><p className="text-xs">按下方 + 新增第一筆</p></div>}
      </div>
    );
  };

  const renderInvestmentView = () => (
    <div className="relative">
       <div className="bg-gray-900 p-6 rounded-3xl text-white shadow-lg relative overflow-hidden mb-6">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500 rounded-full opacity-20 blur-3xl"></div>
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
             <div className="flex items-end gap-2">
                <span className="text-3xl font-bold">Yu-Pao's Portfolio</span>
             </div>
             <span className="text-xs font-bold bg-white/10 px-2 py-1 rounded text-blue-200 border border-white/10 whitespace-nowrap">{selectedMonth}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/10 p-3 rounded-xl backdrop-blur-md">
              <div className="flex items-center gap-1 mb-1">
                 <p className="text-xs text-gray-400">當月新增可投資額度</p>
                 <Info className="w-3 h-3 text-gray-500 cursor-help" />
              </div>
              <p className="text-xl font-bold text-blue-300">${stats.investment.monthlyMaxInvestable.toLocaleString() || 0}</p>
              {stats.investment.divertedToEmergency > 0 && (
                  <p className="text-[10px] text-orange-300 mt-1">
                    (已扣除 ${stats.investment.divertedToEmergency.toLocaleString()} 至預備金)
                  </p>
              )}
            </div>
            <div className="bg-white/10 p-3 rounded-xl backdrop-blur-md">
               <p className="text-xs text-gray-400 mb-1">當月實際投入金額</p>
               <p className="text-xl font-bold text-green-300">${stats.investment.actualInvested.toLocaleString() || 0}</p>
            </div>
          </div>

          <div className="mt-4">
             <div className={`bg-white/20 p-4 rounded-xl backdrop-blur-md border ${stats.investment.monthlyRemainingInvestable < 0 ? 'border-red-400/50' : 'border-white/10'}`}>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-200 font-bold">當月新增加碼資金</span>
                  <span className={`text-2xl font-bold ${stats.investment.monthlyRemainingInvestable < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                     ${stats.investment.monthlyRemainingInvestable.toLocaleString() || 0}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1 text-right">
                   公式：新增額度 - 本月實際投入
                </p>
             </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-1">
             <div className="flex justify-between items-center">
                <span className="text-sm text-gray-200 font-bold">歷史累積可加碼資金</span>
                <span className="text-2xl font-bold text-gray-400">${stats.investment.cumulativeAddOnAvailable.toLocaleString() || 0}</span>
             </div>
             {stats.investment.accumulatedDeficit > 0 && (
                 <div className="flex justify-between items-center">
                    <span className="text-xs text-red-400">目前累積未補赤字</span>
                    <span className="text-sm font-bold text-red-400">-${stats.investment.accumulatedDeficit.toLocaleString()}</span>
                 </div>
             )}
          </div>
        </div>
      </div>
       
      <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
        <h4 className="font-bold text-orange-800 mb-2 flex items-center gap-2">
          <Coins className="w-4 h-4" /> 現金累積存款 (10% 儲蓄)
        </h4>
        <div className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm">
          <span className="text-sm text-gray-500">目前累積</span>
          <span className="font-bold text-gray-800">${stats.investment.savings.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );

  const renderSettingsView = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2 px-2"><h3 className="font-bold text-2xl text-gray-800">設定</h3></div>
      
      {/* 緊急預備金設定 */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-gray-600" /> 緊急預備金設定</h4>
        <div className="space-y-5">
           <div>
              <label className="text-sm font-bold text-gray-700 block mb-2">初始緊急預備金</label>
              <div className="relative"><span className="absolute left-3 top-3 text-gray-400">$</span><input type="number" placeholder="0" className="w-full bg-gray-50 rounded-xl pl-8 pr-4 py-3 font-bold text-gray-900 text-base focus:outline-blue-500 focus:bg-white border border-transparent focus:border-blue-200 transition" value={initialStats.emergencyCurrent || ''} onChange={e => setInitialStats({...initialStats, emergencyCurrent: Number(e.target.value)})} /></div>
           </div>
           <div>
              <label className="text-sm font-bold text-gray-700 block mb-2">預備金目標金額</label>
              <div className="relative"><span className="absolute left-3 top-3 text-gray-400">$</span><input type="number" placeholder="0" className="w-full bg-gray-50 rounded-xl pl-8 pr-4 py-3 font-bold text-gray-900 text-base focus:outline-blue-500 focus:bg-white border border-transparent focus:border-blue-200 transition" value={initialStats.emergencyGoal || ''} onChange={e => setInitialStats({...initialStats, emergencyGoal: Number(e.target.value)})} /></div>
              <p className="text-xs text-gray-400 mt-2">建議設定為 3~6 個月的生活開銷</p>
           </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Settings className="w-5 h-5 text-gray-600" /> 初始資產配置</h4>
        <div className="space-y-5">
           <div>
              <label className="text-sm font-bold text-gray-700 block mb-2">累積可加碼資金</label>
              <div className="relative"><span className="absolute left-3 top-3 text-gray-400">$</span><input type="number" placeholder="0" className="w-full bg-gray-50 rounded-xl pl-8 pr-4 py-3 font-bold text-gray-900 text-base focus:outline-blue-500 focus:bg-white border border-transparent focus:border-blue-200 transition" value={initialStats.available || ''} onChange={e => setInitialStats({...initialStats, available: Number(e.target.value)})} /></div>
           </div>
           <div>
              <label className="text-sm font-bold text-gray-700 block mb-2">初始當月新增可投資額度</label>
              <div className="relative"><span className="absolute left-3 top-3 text-gray-400">$</span><input type="number" placeholder="0" className="w-full bg-gray-50 rounded-xl pl-8 pr-4 py-3 font-bold text-gray-900 text-base focus:outline-blue-500 focus:bg-white border border-transparent focus:border-blue-200 transition" value={initialStats.initialInvestable || ''} onChange={e => setInitialStats({...initialStats, initialInvestable: Number(e.target.value)})} /></div>
           </div>
           <div>
              <label className="text-sm font-bold text-gray-700 block mb-2">現金累積存款</label>
              <div className="relative"><span className="absolute left-3 top-3 text-gray-400">$</span><input type="number" placeholder="0" className="w-full bg-gray-50 rounded-xl pl-8 pr-4 py-3 font-bold text-gray-900 text-base focus:outline-blue-500 focus:bg-white border border-transparent focus:border-blue-200 transition" value={initialStats.savings || ''} onChange={e => setInitialStats({...initialStats, savings: Number(e.target.value)})} /></div>
           </div>
        </div>
      </div>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
         <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Edit3 className="w-5 h-5 text-gray-600" /> 每月預算設定</h4>
         <div className="space-y-4">
            {CATEGORIES.filter(c => c !== '收入' && c !== '投資').map(cat => (
               <div key={cat} className="flex items-center gap-3">
                  <label className="w-20 text-sm font-medium text-gray-600">{cat}</label>
                  <div className="flex-1 relative"><input type="number" placeholder="無預算" className="w-full bg-gray-50 rounded-lg px-3 py-2 text-base font-bold text-gray-800 focus:outline-blue-500" value={budgets[cat] || ''} onChange={(e) => updateBudget(cat, e.target.value)} /></div>
               </div>
            ))}
            <p className="text-xs text-gray-400 text-center mt-2">設定為 0 即可隱藏該分類的進度條</p>
         </div>
      </div>
      <div className="px-4 py-4 text-center"><p className="text-xs text-gray-400">Ver 2.9.1 for Yu-Pao (Bug Fix)</p></div>
    </div>
  );

  const needsScrolling = activeTab === 'dashboard' || activeTab === 'history' || activeTab === 'form' || activeTab === 'settings';
  
  const scrollContainerClasses = `
    flex-1 relative p-4 
    ${needsScrolling 
        ? 'overflow-y-auto hide-scrollbar pb-32'
        : 'overflow-hidden'
    }
  `;

  return (
    <>
      <style>{`
        html, body, #root {
          height: 100%;
          overflow: hidden;
          position: fixed;
          width: 100%;
          overscroll-behavior: none;
        }
        .recharts-text {
          font-family: sans-serif !important;
        }
      `}</style>

      {/* Main Container - Fixed to viewport to prevent body scroll */}
      <div className="fixed inset-0 w-full h-[100dvh] bg-gray-100 flex justify-center items-center overflow-hidden">
        {/* App Frame */}
        <div className="w-full max-w-md h-full bg-gray-50 flex flex-col relative shadow-2xl overflow-hidden font-sans text-gray-900 select-none touch-manipulation overscroll-none">
           {deleteModal.show && (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animation-fade-in">
               <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs transform transition-all scale-100">
                  <div className="flex flex-col items-center text-center mb-4"><div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-3"><AlertCircle className="w-6 h-6" /></div><h3 className="text-lg font-bold text-gray-900">確定要刪除嗎？</h3><p className="text-sm text-gray-500 mt-1">此動作無法復原。</p></div>
                  <div className="flex gap-3">
                     <button onClick={() => setDeleteModal({ show: false, id: null })} className="flex-1 py-2.5 rounded-xl text-gray-700 font-bold bg-gray-100 hover:bg-gray-200 transition">取消</button>
                     <button onClick={confirmDelete} className="flex-1 py-2.5 rounded-xl text-white font-bold bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200 transition">刪除</button>
                  </div>
               </div>
            </div>
           )}

           {/* Calculator Overlay */}
           {isCalculatorOpen && (
              <div className="absolute inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)] animation-slide-up h-[45%] flex flex-col">
                  {/* Display Area */}
                  <div className="flex-1 bg-gray-50 p-4 border-b border-gray-100 flex flex-col justify-center items-end rounded-t-3xl">
                      <span className="text-3xl font-bold text-gray-800 tracking-wide">{calcDisplay}</span>
                  </div>
                  
                  {/* Keypad */}
                  <div className="grid grid-cols-4 h-full">
                      {['AC', '÷', '×', 'DEL'].map((btn) => (
                        <button key={btn} onClick={() => handleCalcInput(btn === '÷' ? '/' : btn === '×' ? '*' : btn)} className="bg-gray-100 text-gray-600 font-bold text-lg active:bg-gray-200 flex items-center justify-center border-r border-b border-gray-200">
                            {btn === 'DEL' ? <Delete className="w-6 h-6" /> : btn}
                        </button>
                      ))}
                      {['7', '8', '9', '-'].map((btn) => (
                        <button key={btn} onClick={() => handleCalcInput(btn)} className={`${['-'].includes(btn) ? 'bg-blue-50 text-blue-600' : 'bg-white text-gray-800'} font-bold text-2xl active:bg-gray-100 flex items-center justify-center border-r border-b border-gray-200`}>
                            {btn}
                        </button>
                      ))}
                      {['4', '5', '6', '+'].map((btn) => (
                        <button key={btn} onClick={() => handleCalcInput(btn)} className={`${['+'].includes(btn) ? 'bg-blue-50 text-blue-600' : 'bg-white text-gray-800'} font-bold text-2xl active:bg-gray-100 flex items-center justify-center border-r border-b border-gray-200`}>
                            {btn}
                        </button>
                      ))}
                      {['1', '2', '3', '='].map((btn) => (
                        <button key={btn} onClick={() => handleCalcInput(btn)} className={`${['='].includes(btn) ? 'bg-blue-600 text-white' : 'bg-white text-gray-800'} font-bold text-2xl active:opacity-90 flex items-center justify-center border-r border-b border-gray-200`}>
                            {btn}
                        </button>
                      ))}
                      {/* Last Row */}
                      <button onClick={() => handleCalcInput('0')} className="col-span-1 bg-white text-gray-800 font-bold text-2xl active:bg-gray-100 flex items-center justify-center border-r border-gray-200">0</button>
                      <button onClick={() => handleCalcInput('.')} className="col-span-1 bg-white text-gray-800 font-bold text-2xl active:bg-gray-100 flex items-center justify-center border-r border-gray-200">.</button>
                      <button onClick={() => handleCalcInput('OK')} className="col-span-2 bg-black text-white font-bold text-xl active:bg-gray-800 flex items-center justify-center">OK</button>
                  </div>
                  
                  {/* Close button (optional, since OK handles it, but good for UX) */}
                  <button onClick={() => setIsCalculatorOpen(false)} className="absolute top-2 left-2 p-2 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
           )}

          {/* Header - Fixed Height */}
          <div className="flex-none bg-white px-6 pt-[calc(env(safe-area-inset-top)+20px)] pb-4 border-b border-gray-100 z-20">
            <div className="flex justify-between items-center">
              <div><h1 className="text-2xl font-black text-gray-900">Hi, Yu-Pao</h1><p className="text-xs text-gray-500">每次記帳都將離財務獨立更進一步</p></div>
            </div>
          </div>

          {/* Content Area - Scrollable */}
          <div className={scrollContainerClasses}>
            {activeTab === 'dashboard' && renderDashboardView()}
            {activeTab === 'history' && renderHistoryView()}
            {activeTab === 'form' && renderFormView()}
            {activeTab === 'investment' && renderInvestmentView()}
            {activeTab === 'settings' && renderSettingsView()}
          </div>

          {/* Footer - Fixed Height */}
          <div className="flex-none bg-white border-t border-gray-200 px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+20px)] flex justify-between items-center z-30">
            <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 transition ${activeTab === 'dashboard' ? 'text-blue-600' : 'text-gray-400'}`}><PieChart className="w-6 h-6" /><span className="text-[10px] font-medium">總覽</span></button>
            <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-1 transition ${activeTab === 'history' ? 'text-blue-600' : 'text-gray-400'}`}><List className="w-6 h-6" /><span className="text-[10px] font-medium">明細</span></button>
            <div className="relative -top-6"><button onClick={handleFabClick} className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-300 hover:scale-105 transition ${activeTab === 'form' && !editingId ? 'bg-black' : 'bg-blue-600'}`}><Plus className={`w-8 h-8 transition-transform ${activeTab === 'form' && !editingId ? 'rotate-45' : ''}`} /></button></div>
            <button onClick={() => setActiveTab('investment')} className={`flex flex-col items-center gap-1 transition ${activeTab === 'investment' ? 'text-blue-600' : 'text-gray-400'}`}><TrendingUp className="w-6 h-6" /><span className="text-[10px] font-medium">投資</span></button>
            <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 transition ${activeTab === 'settings' ? 'text-blue-600' : 'text-gray-400'}`}><Settings className="w-6 h-6" /><span className="text-[10px] font-medium">設定</span></button>
          </div>
        </div>
      </div>
    </>
  );
}