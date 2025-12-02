import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, PieChart, TrendingUp, DollarSign, List, Settings, AlertCircle, Coins, Edit3, Calendar, Info, CreditCard, Calculator, Trash2, ChevronLeft, Save, ShieldCheck, CheckCircle, Coffee, Shield, Delete, X, Eye, EyeOff, Link as LinkIcon, PiggyBank, RefreshCcw, Lock, Download } from 'lucide-react';
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
  fromSavings?: boolean; // Expense: Paid from savings
  isAssetLiquidation?: boolean; // Income: Direct to savings (e.g. selling camera)
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
  income: number;          // Regular income
  assetLiquidation: number; // Income from selling assets
  expense: number;         // Regular expenses
  savingsExpense: number;  // Expenses paid from savings
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
  deficitDeducted: number; // Deficit deducted from capital immediately
  accumulatedDeficit: number; // Kept for legacy compatibility, but logic changed to strict
  savings: number;
  emergencyFund: number;
  divertedToEmergency: number;
  capitalDivertedToEmergency: number; 
  emergencyGoal: number;
}

// --- 色彩配置 (Critical Wealth Theme - Dark/Cream/Mono) ---
const THEME = {
  darkBg: '#1C1C1E',      // iOS Dark Gray
  darkCard: '#2C2C2E',    // iOS Dark Gray Light
  accentGold: '#C59D5F',  // From Icon: Gold
  textPrimary: '#000000', // Black
  creamBg: '#F9F5F0',     // Light Cream
  bgGray: '#F2F2F7',      // iOS System Gray 6
  danger: '#FF3B30',      // iOS Red
  success: '#34C759',     // iOS Green
  
  // Text Colors
  textBlue: '#5AC8FA',    
  textGreen: '#30D158',   
  textYellow: '#FFD60A',  
  textBrown: '#8B5E3C',   
};

const COLORS = ['#C59D5F', '#8B5E3C', '#588157', '#E9C46A', '#F4A261', '#E76F51', '#2A9D8F', '#264653'];

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

// --- 元件定義 (移至 App 外部以確保穩定性) ---
const CardContainer = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 ${className}`}>
    {children}
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [hideFuture, setHideFuture] = useState(false);
  
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

  // --- Swipe to Delete State ---
  const [swipedId, setSwipedId] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  // --- Calculator State ---
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    installmentCount: '3', 
    installmentCalcType: 'total' as 'total' | 'monthly', 
    perMonthInput: '',
    investSource: 'monthly' as 'monthly' | 'cumulative',
    fromSavings: false, 
    isAssetLiquidation: false, // New field
  });
  
  const [editingId, setEditingId] = useState<number | null>(null);

  // --- Export Logic ---
  const handleExport = () => {
    const csvRows = [];
    const headers = ['ID', '日期', '類型', '分類', '金額', '標籤', '備註', '資金屬性'];
    csvRows.push(headers.join(','));

    transactions.forEach(t => {
        let typeLabel = t.type === 'income' ? '收入' : '支出';
        let tagLabel = '';
        if (t.tag === 'need') tagLabel = 'Need';
        if (t.tag === 'want') tagLabel = 'Want';
        
        let specialLabel = '一般月收支';
        if (t.category === '投資') {
            specialLabel = t.investSource === 'cumulative' ? '累積資金投資' : '當月額度投資';
        } else if (t.fromSavings) {
            specialLabel = '存款支付';
        } else if (t.isAssetLiquidation) {
            specialLabel = '資產變現';
        }

        const row = [
            t.id,
            t.date,
            typeLabel,
            t.category,
            t.amount,
            tagLabel,
            `"${(t.note || '').replace(/"/g, '""')}"`, // Escape double quotes
            specialLabel
        ];
        csvRows.push(row.join(','));
    });

    // Add BOM for Excel utf-8 support
    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `critical_wealth_backup_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Calculator Logic (Simple & Direct) ---
  const handleCalcInput = (key: string) => {
    const currentValue = formData.amount;
    let newValue = currentValue;

    if (key === 'AC') {
        newValue = '';
    } else if (key === 'DEL') {
        newValue = currentValue.length > 0 ? currentValue.slice(0, -1) : '';
    } else if (key === '%') {
        try {
             if (currentValue) {
                const cleanValue = currentValue.replace(/[^0-9+\-*/.]/g, '');
                // eslint-disable-next-line no-new-func
                const result = new Function('return ' + cleanValue)();
                newValue = String(Number(result) / 100);
             }
        } catch(e) { newValue = currentValue; }
    } else if (key === '=') {
        try {
            // Clean up trailing operators
            let cleanValue = currentValue.replace(/[^0-9+\-*/.]/g, '');
            if (['+', '-', '*', '/'].includes(cleanValue.slice(-1))) {
                cleanValue = cleanValue.slice(0, -1);
            }
            
            if (cleanValue) {
                // eslint-disable-next-line no-new-func
                const result = new Function('return ' + cleanValue)();
                newValue = String(Math.floor(Number(result)));
            }
            // IMPORTANT: Always close on equals
            setIsCalculatorOpen(false);
        } catch (e) {
            newValue = currentValue; 
        }
    } else {
        if (currentValue === '0' && !['+', '-', '*', '/', '.'].includes(key)) {
            newValue = key;
        } else {
            // Prevent multiple consecutive operators
            const isOperator = ['+', '-', '*', '/'].includes(key);
            const lastChar = currentValue.slice(-1);
            const isLastOperator = ['+', '-', '*', '/'].includes(lastChar);
            
            if (isOperator && isLastOperator) {
                newValue = currentValue.slice(0, -1) + key;
            } else {
                newValue = currentValue + key;
            }
        }
    }

    // Update main amount directly
    setFormData(prev => ({ ...prev, amount: newValue }));
  };

  const openCalculator = () => {
      // Only open if not in monthly calculation mode (locked)
      if (formData.installmentCalcType === 'monthly' && formData.isInstallment) return;
      setIsCalculatorOpen(true);
      
      // Scroll to top smoothly to ensure amount field is visible
      setTimeout(() => {
          if (scrollRef.current) {
              scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
          }
      }, 100);
  };

  // --- 核心邏輯計算 ---
  const stats = useMemo(() => {
    let monthlyRawData: { [key: string]: MonthlyData } = {};
    
    availableMonths.forEach(m => {
        monthlyRawData[m] = { 
          income: 0, 
          assetLiquidation: 0,
          expense: 0, 
          savingsExpense: 0, 
          actualInvested: 0, 
          need: 0, 
          want: 0, 
          categoryMap: {} 
        };
    });

    transactions.forEach(t => {
      const monthKey = t.date.substring(0, 7);
      if (!monthlyRawData[monthKey]) {
          monthlyRawData[monthKey] = { income: 0, assetLiquidation: 0, expense: 0, savingsExpense: 0, actualInvested: 0, need: 0, want: 0, categoryMap: {} };
      }

      if (t.category === '收入') {
        // Logic Update 1: Separate regular income from asset liquidation
        if (t.isAssetLiquidation) {
            monthlyRawData[monthKey].assetLiquidation += Number(t.amount);
        } else {
            monthlyRawData[monthKey].income += Number(t.amount);
        }
      } else if (t.category === '投資') {
         monthlyRawData[monthKey].actualInvested += Number(t.amount);
         
         if (t.tag === 'invest_monthly') {
             monthlyRawData[monthKey].expense += Number(t.amount);
         }
      } else {
        const amount = Number(t.amount);
        
        if (t.fromSavings) {
            monthlyRawData[monthKey].savingsExpense += amount;
        } else {
            monthlyRawData[monthKey].expense += amount;
            if (t.tag === 'need') monthlyRawData[monthKey].need += amount;
            else if (t.tag === 'want') monthlyRawData[monthKey].want += amount;
        }

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
      const { income, assetLiquidation, expense, savingsExpense, actualInvested, categoryMap, need, want } = monthlyRawData[month];
      const netIncome = income - expense; 
      
      let monthlyMaxInvestable = carryOverBudget; 
      
      let surplusForNextMonth = 0; 
      let currentMonthSavingsAddon = 0; 
      let deficitDeducted = 0;
      let divertedToEmergency = 0; 
      let capitalDivertedToEmergency = 0; 

      // Step A: Handle Monthly Net Income Flow
      if (netIncome > 0) {
        // Priority 1: Fill Emergency Fund with Monthly Surplus
        let realSurplus = netIncome;
        const emergencyGap = Math.max(0, emergencyGoal - runningEmergencyFund);
        
        if (emergencyGap > 0) {
            divertedToEmergency = Math.min(realSurplus, emergencyGap);
            realSurplus -= divertedToEmergency;
            runningEmergencyFund += divertedToEmergency;
        }

        if (realSurplus > 0) {
            surplusForNextMonth = realSurplus * 0.9;
            currentMonthSavingsAddon = realSurplus * 0.1;
        } else {
            surplusForNextMonth = 0;
            currentMonthSavingsAddon = 0;
        }

      } else {
        // STRICT DEFICIT MODE
        const deficit = Math.abs(netIncome);
        deficitDeducted = deficit;
        cumulativeInvestable -= deficit; 
        
        surplusForNextMonth = 0;
        currentMonthSavingsAddon = 0;
      }

      // Step B: Update Savings 
      cumulativeSavings = cumulativeSavings + currentMonthSavingsAddon + assetLiquidation - savingsExpense;
      
      // Step C: Calculate Investable Pool
      cumulativeInvestable = cumulativeInvestable + monthlyMaxInvestable - actualInvested;
      carryOverBudget = surplusForNextMonth;

      // Step D: PRIORITY CHECK - Use Accumulated Capital to fill Emergency Gap
      const remainingEmergencyGap = Math.max(0, emergencyGoal - runningEmergencyFund);
      if (remainingEmergencyGap > 0 && cumulativeInvestable > 0) {
          const transferAmount = Math.min(cumulativeInvestable, remainingEmergencyGap);
          cumulativeInvestable -= transferAmount;
          runningEmergencyFund += transferAmount;
          capitalDivertedToEmergency = transferAmount; 
      }

      processedMonthsData[month] = {
          income,
          assetLiquidation,
          expense,
          savingsExpense, 
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
          capitalDivertedToEmergency, 
          emergencyGoal
      };
    });

    const currentData = processedMonthsData[selectedMonth] || {
        income: 0, assetLiquidation: 0, expense: 0, savingsExpense: 0, netIncome: 0, categoryMap: {}, actualInvested: 0, need: 0, want: 0,
        monthlyMaxInvestable: carryOverBudget,
        monthlyRemainingInvestable: carryOverBudget - 0, 
        cumulativeAddOnAvailable: cumulativeInvestable,
        deficitDeducted: 0, accumulatedDeficit: 0, savings: cumulativeSavings, 
        emergencyFund: runningEmergencyFund, divertedToEmergency: 0, capitalDivertedToEmergency: 0, emergencyGoal: emergencyGoal
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
      installmentCount: '3',  
      installmentCalcType: 'total',
      perMonthInput: '',
      investSource: 'monthly',
      fromSavings: false,
      isAssetLiquidation: false,
    });
    setActiveTab('form');
  };

  const openEditMode = (trans: Transaction) => {
    if (swipedId === trans.id) return; 
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
      installmentCount: '3', 
      installmentCalcType: 'total',
      perMonthInput: '',
      investSource: source,
      fromSavings: trans.fromSavings || false,
      isAssetLiquidation: trans.isAssetLiquidation || false,
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
    
    // 如果輸入框還有未計算的算式，先計算
    let finalAmount = formData.amount;
    try {
       let cleanValue = formData.amount.replace(/[^0-9+\-*/.]/g, '');
       if (['+', '-', '*', '/'].includes(cleanValue.slice(-1))) {
           cleanValue = cleanValue.slice(0, -1);
       }
       // eslint-disable-next-line no-new-func
       const result = new Function('return ' + cleanValue)();
       finalAmount = String(Math.floor(Number(result)));
    } catch(e) {
       // ignore
    }

    let finalTag: 'need' | 'want' | 'income' | 'invest_monthly' | 'invest_cumulative';
    if (formData.category === '收入') {
      finalTag = 'income';
    } else if (formData.category === '投資') {
      finalTag = formData.investSource === 'cumulative' ? 'invest_cumulative' : 'invest_monthly';
    } else {
      finalTag = formData.tag;
    }

    if (editingId) {
      const originalTrans = transactions.find(t => t.id === editingId);
      
      if (originalTrans && originalTrans.groupId) {
          const updatedTransactions = transactions.map(t => {
              if (t.groupId === originalTrans.groupId) {
                  let newDate = t.date;
                  if (t.id === editingId && t.date !== formData.date) {
                      newDate = formData.date;
                  } else if (t.date !== formData.date) {
                      const oldEditDateObj = new Date(originalTrans.date);
                      const newEditDateObj = new Date(formData.date);
                      const timeDiff = newEditDateObj.getTime() - oldEditDateObj.getTime();
                      const currentTDateObj = new Date(t.date);
                      const newTDateObj = new Date(currentTDateObj.getTime() + timeDiff);
                      newDate = newTDateObj.toISOString().split('T')[0];
                  }

                  return {
                      ...t,
                      date: t.id === editingId ? formData.date : newDate,
                      category: formData.category,
                      amount: Number(finalAmount),
                      tag: finalTag,
                      fromSavings: formData.fromSavings,
                      isAssetLiquidation: formData.isAssetLiquidation,
                  };
              }
              return t;
          });
          setTransactions(updatedTransactions);
      } else {
          setTransactions(transactions.map(t => t.id === editingId ? { ...t, ...formData, tag: finalTag, amount: Number(finalAmount), fromSavings: formData.fromSavings, isAssetLiquidation: formData.isAssetLiquidation } : t));
      }
      
      setActiveTab('history');
      return;
    } 
    
    const baseId = transactions.length > 0 ? Math.max(...transactions.map(t => t.id)) + 1 : 1;
    const totalAmount = Number(finalAmount);
    
    const shouldInstallment = !formData.fromSavings && !formData.isAssetLiquidation && formData.isInstallment && formData.type === 'expense' && formData.category !== '投資' && Number(formData.installmentCount) > 1;

    if (shouldInstallment) {
       const newTransactions: Transaction[] = [];
       const count = Math.round(Number(formData.installmentCount));
       const perMonthAmount = Math.floor(totalAmount / count);
       const remainder = totalAmount - (perMonthAmount * count);
       const startDate = new Date(formData.date);
       const startDay = startDate.getDate();
       const groupId = `group_${baseId}_${Date.now()}`; 
        
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
             groupId: groupId, 
             tag: finalTag,
             fromSavings: false, 
             isAssetLiquidation: false,
          });
       }
       setTransactions([...newTransactions, ...transactions]);
    } else {
       const item: Transaction = { id: baseId, ...formData, tag: finalTag, amount: totalAmount };
       setTransactions([item, ...transactions]);
    }
    
    setActiveTab('history');
  };

  const requestDelete = (e: React.MouseEvent | React.TouchEvent, id: number) => { 
      e.stopPropagation(); 
      setDeleteModal({ show: true, id });
      setSwipedId(null); 
  };
  const confirmDelete = () => {
    if (deleteModal.id) {
      setTransactions(transactions.filter(t => t.id !== deleteModal.id));
      if (activeTab === 'form' && editingId === deleteModal.id) setActiveTab('history');
    }
    setDeleteModal({ show: false, id: null });
  };
  const updateBudget = (category: string, value: string) => { setBudgets(prev => ({ ...prev, [category]: Number(value) })); };

  // --- iOS Style Views ---

  const renderDashboardView = () => {
    const { emergencyFund, emergencyGoal } = stats.dashboard;
    const emergencyProgress = Math.min((emergencyFund / emergencyGoal) * 100, 100);
    const isEmergencyFull = emergencyFund >= emergencyGoal;

    return (
      <div className="space-y-6 pb-4 pt-2">
        <div className="flex justify-start items-center px-1">
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white text-black font-bold text-sm rounded-full px-4 py-2 border border-gray-200 outline-none shadow-sm appearance-none pr-8 relative z-10"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3e%3cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3e%3c/path%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
            >
              {availableMonths.map(m => ( <option key={m} value={m}>{m}</option> ))}
            </select>
        </div>

        <div className="p-6 rounded-[24px] text-white relative overflow-hidden shadow-xl" style={{ backgroundColor: THEME.darkBg }}>
           <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                 <div>
                    <h2 className="text-sm font-medium opacity-80 flex items-center gap-2 mb-2"><Shield className="w-4 h-4" /> 緊急預備金</h2>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold tracking-tight text-white">${Math.floor(emergencyFund).toLocaleString()}</span>
                        <span className="text-sm opacity-50 font-medium">/ ${emergencyGoal.toLocaleString()}</span>
                    </div>
                 </div>
                 {isEmergencyFull ? (
                    <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 text-white">
                        <CheckCircle className="w-3.5 h-3.5" /> 已達標
                    </div>
                 ) : (
                    <div className="bg-orange-500/20 text-orange-400 border border-orange-500/30 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold animate-pulse">
                        補水中
                    </div>
                 )}
              </div>
              
              <div className="w-full bg-white/10 rounded-full h-2.5 mb-2 overflow-hidden">
                 <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${emergencyProgress}%`, backgroundColor: isEmergencyFull ? THEME.success : '#F6AD55' }}></div>
              </div>
              <p className="text-[11px] opacity-60 text-right">
                 {isEmergencyFull ? '資金充裕' : '優先級：所有閒置資金 > 緊急預備金'}
              </p>
           </div>
        </div>

        <CardContainer className="p-5 flex justify-between items-center">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">淨收支</p>
            <p className={`text-3xl font-bold tracking-tight ${stats.dashboard.netIncome >= 0 ? 'text-gray-900' : 'text-[#F56565]'}`}>
              {stats.dashboard.netIncome >= 0 ? '+' : ''}{stats.dashboard.netIncome.toLocaleString()}
            </p>
          </div>
          <div className="text-right space-y-1">
             <div className="flex items-center gap-2 justify-end">
                <span className="text-[10px] font-bold text-gray-400 uppercase">收入</span>
                <span className="text-sm font-bold" style={{ color: THEME.success }}>+${stats.dashboard.income.toLocaleString()}</span>
             </div>
             <div className="flex items-center gap-2 justify-end">
                <span className="text-[10px] font-bold text-gray-400 uppercase">支出</span>
                <span className="text-sm font-bold" style={{ color: THEME.danger }}>-${stats.dashboard.expense.toLocaleString()}</span>
             </div>
          </div>
        </CardContainer>

        <div className="grid grid-cols-2 gap-4">
            <CardContainer className="p-5 flex flex-col justify-between h-32">
               <div>
                 <div className="flex items-center gap-2 mb-2 text-gray-500">
                    <CheckCircle className="w-4 h-4 text-black" />
                    <span className="text-xs font-bold uppercase tracking-wider">需要 (Need)</span>
                 </div>
                 <p className="text-2xl font-bold text-gray-900">${stats.dashboard.need.toLocaleString()}</p>
               </div>
               <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                   <div className="h-full bg-black rounded-full" style={{ width: `${stats.dashboard.expense > 0 ? (stats.dashboard.need / stats.dashboard.expense * 100) : 0}%` }}></div>
               </div>
            </CardContainer>
            
            <CardContainer className="p-5 flex flex-col justify-between h-32">
               <div>
                 <div className="flex items-center gap-2 mb-2 text-gray-500">
                    <Coffee className="w-4 h-4 text-[#C59D5F]" />
                    <span className="text-xs font-bold uppercase tracking-wider">想要 (Want)</span>
                 </div>
                 <p className="text-2xl font-bold text-gray-900">${stats.dashboard.want.toLocaleString()}</p>
               </div>
               <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                   <div className="h-full bg-[#C59D5F] rounded-full" style={{ width: `${stats.dashboard.expense > 0 ? (stats.dashboard.want / stats.dashboard.expense * 100) : 0}%` }}></div>
               </div>
            </CardContainer>
        </div>

        <CardContainer className="p-5">
          <div className="flex justify-between items-center mb-6">
             <h3 className="font-bold text-lg text-black">預算執行狀況</h3>
             <button onClick={() => setActiveTab('settings')} className="text-xs font-bold text-black bg-gray-100 px-3 py-1.5 rounded-lg">編輯</button>
          </div>
          
          <div className="space-y-6">
            {Object.entries(budgets).filter(([_, budget]) => (budget as number) > 0).map(([cat, budget]) => {
                const currentMonthTransactions = transactions.filter(t => t.date.startsWith(selectedMonth));
                const spent = currentMonthTransactions.filter(t => t.category === cat && !t.fromSavings).reduce((sum, t) => sum + Number(t.amount), 0);
                const percent = Math.min((spent / (budget as number)) * 100, 100);
                const isOver = spent > (budget as number);
                
                return (
                <div key={cat} className="group">
                    <div className="flex justify-between text-sm mb-2">
                        <span className="font-bold text-gray-700">{cat}</span>
                        <span className="text-gray-500 font-medium text-xs">
                            <span className={isOver ? 'text-red-500 font-bold' : 'text-black'}>${spent.toLocaleString()}</span> 
                            <span className="text-gray-300 mx-1">/</span> 
                            ${(budget as number).toLocaleString()}
                        </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-[#FF3B30]' : 'bg-black'}`} style={{ width: `${percent}%` }}></div>
                    </div>
                </div>
                );
            })}
            {Object.values(budgets).every(b => b === 0) && <p className="text-sm text-gray-400 text-center py-2">尚未設定預算</p>}
          </div>
        </CardContainer>

        <CardContainer className="p-6">
          <h3 className="font-bold text-lg text-black mb-6">支出分類佔比</h3>
          {stats.dashboard.pieData.length > 0 ? (
            <>
                <div className="h-64 -mx-4 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                        <Pie 
                            data={stats.dashboard.pieData} 
                            cx="50%" 
                            cy="50%" 
                            innerRadius={65} 
                            outerRadius={85} 
                            paddingAngle={4} 
                            dataKey="value"
                            stroke="none"
                        >
                        {stats.dashboard.pieData.map((entry, index) => ( <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} /> ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    </RePieChart>
                    </ResponsiveContainer>
                </div>
                
                <div className="space-y-3">
                    {stats.dashboard.pieData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-3">
                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                            <span className="text-sm font-semibold text-gray-600">{entry.name}</span>
                        </div>
                        <div className="text-right flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900">${entry.value.toLocaleString()}</span>
                            <span className="text-xs text-gray-400 font-medium w-10 text-right">
                                {stats.dashboard.expense > 0 ? ((entry.value / stats.dashboard.expense) * 100).toFixed(0) : 0}%
                            </span>
                        </div>
                    </div>
                    ))}
                </div>
            </>
          ) : (
              <div className="h-32 flex items-center justify-center text-gray-400 text-sm">尚無支出紀錄</div>
          )}
        </CardContainer>
      </div>
    );
  };

  const renderFormView = () => {
    const currentSavings = stats.investment.savings;
    const isSavingsInsufficient = formData.fromSavings && (Number(formData.amount) > currentSavings);

    return (
        <div className="space-y-5 pb-20 pt-2">
        <div className="flex items-center justify-between px-1 mb-2">
            <button onClick={() => setActiveTab('dashboard')} className="flex items-center text-gray-500 font-medium -ml-2 p-2 hover:bg-gray-100 rounded-lg transition">
                <ChevronLeft className="w-5 h-5" /> 返回
            </button>
            <div className="w-10"></div>
        </div>

        <div className="bg-gray-200/60 p-1.5 rounded-xl flex relative">
            <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-white rounded-[10px] shadow-sm transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${formData.type === 'expense' ? 'left-1.5' : 'left-[calc(50%+1.5px)]'}`}></div>
            <button 
                onClick={() => setFormData({...formData, type: 'expense', category: '飲食', investSource: 'monthly', isAssetLiquidation: false})} 
                className={`flex-1 py-2 text-sm font-bold relative z-10 transition-colors ${formData.type === 'expense' ? 'text-gray-900' : 'text-gray-500'}`}
            >
                支出
            </button>
            <button 
                onClick={() => setFormData({...formData, type: 'income', category: '收入', tag: 'income', investSource: 'monthly', fromSavings: false})} 
                className={`flex-1 py-2 text-sm font-bold relative z-10 transition-colors ${formData.type === 'income' ? 'text-gray-900' : 'text-gray-500'}`}
            >
                收入
            </button>
        </div>

        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
            <div className="flex items-center justify-between p-5 border-b border-gray-50">
                <label className="text-base font-bold text-black">金額</label>
                <div className="flex-1 ml-4 relative">
                    <input 
                    type="text"
                    placeholder="0" 
                    value={formData.amount} 
                    readOnly 
                    onClick={() => openCalculator()}
                    className={`w-full text-right text-3xl font-bold placeholder-gray-200 bg-transparent outline-none ${formData.installmentCalcType === 'monthly' && formData.isInstallment ? 'text-gray-300 cursor-not-allowed' : 'cursor-pointer text-black'}`}
                    />
                </div>
            </div>
            <div className="flex items-center justify-between p-5 border-b border-gray-50 relative">
                <label className="text-base font-bold text-black">日期</label>
                <div className="flex-1 ml-4 text-right">
                    <input 
                        type="date" 
                        value={formData.date} 
                        onChange={e => setFormData({...formData, date: e.target.value})} 
                        className="text-base font-medium text-gray-600 bg-transparent outline-none text-right appearance-none absolute inset-0 opacity-0 z-10 w-full h-full cursor-pointer" 
                    />
                    <span className="text-base font-medium text-gray-600 bg-transparent outline-none text-right pointer-events-none relative z-0">
                        {formData.date.split('-').join('/')}
                    </span>
                </div>
            </div>
            <div className="flex items-center justify-between p-5">
                <label className="text-base font-bold text-black">分類</label>
                <div className="flex items-center gap-2 relative">
                    <select 
                        value={formData.category} 
                        onChange={e => setFormData({...formData, category: e.target.value})} 
                        className="text-base font-medium text-gray-600 bg-transparent outline-none text-right appearance-none pr-6 relative z-10"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3e%3cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3e%3c/path%3e%3c/svg%3e")`, backgroundPosition: 'right center', backgroundRepeat: 'no-repeat', backgroundSize: '1em 1em' }}
                    >
                        {formData.type === 'income' ? <option value="收入">收入</option> : <>{CATEGORIES.filter(c => c !== '收入').map(c => <option key={c} value={c}>{c}</option>)}<option value="投資">投資</option></>}
                    </select>
                </div>
            </div>
        </div>

        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
            {formData.type === 'expense' && formData.category === '投資' ? (
                <div className="p-5">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">資金來源</p>
                    <div className="space-y-4">
                        <label className="flex items-center justify-between cursor-pointer group">
                            <span className="text-base font-medium text-gray-900">當月新增額度</span>
                            <input 
                                type="radio" 
                                name="investSource" 
                                checked={formData.investSource === 'monthly'} 
                                onChange={() => setFormData({...formData, investSource: 'monthly'})} 
                                className="w-5 h-5 text-black accent-black" 
                            />
                        </label>
                        <div className="h-px bg-gray-50 w-full ml-4"></div>
                        <label className="flex items-center justify-between cursor-pointer group">
                            <span className="text-base font-medium text-black">歷史累積資金</span>
                            <input 
                                type="radio" 
                                name="investSource" 
                                checked={formData.investSource === 'cumulative'} 
                                onChange={() => setFormData({...formData, investSource: 'cumulative'})} 
                                className="w-5 h-5 text-black accent-black" 
                            />
                        </label>
                    </div>
                </div>
            ) : formData.type === 'expense' ? (
                <div className="p-4 flex flex-col gap-4">
                    <div className="flex gap-3">
                        <button 
                            onClick={() => setFormData({...formData, tag: 'need'})}
                            className={`flex-1 py-3 rounded-xl text-sm font-bold transition border ${formData.tag === 'need' ? 'bg-gray-100 text-black border-gray-200' : 'bg-white text-gray-400 border-gray-200'}`}
                        >
                            需要 (Need)
                        </button>
                        <button 
                            onClick={() => setFormData({...formData, tag: 'want'})}
                            className={`flex-1 py-3 rounded-xl text-sm font-bold transition border ${formData.tag === 'want' ? 'bg-[#FDF2F8] text-[#D53F8C] border-[#FBCFE8]' : 'bg-white text-gray-400 border-gray-200'}`}
                        >
                            想要 (Want)
                        </button>
                    </div>
                    
                    {/* Pay from Savings Toggle */}
                    <div 
                        onClick={() => setFormData({...formData, fromSavings: !formData.fromSavings, isInstallment: false})}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${formData.fromSavings ? 'bg-[#FEEBC8] border-[#FBD38D]' : 'bg-white border-gray-200'}`}
                    >
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-full ${formData.fromSavings ? 'bg-[#F6AD55] text-white' : 'bg-gray-100 text-gray-400'}`}>
                                <PiggyBank className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col">
                                <span className={`text-sm font-bold ${formData.fromSavings ? 'text-[#975A16]' : 'text-gray-500'}`}>使用現金存款支付</span>
                                {formData.fromSavings && <span className="text-[10px] text-[#C05621] font-medium">餘額: ${currentSavings.toLocaleString()}</span>}
                            </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.fromSavings ? 'bg-[#975A16] border-[#975A16]' : 'border-gray-300'}`}>
                            {formData.fromSavings && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                        </div>
                    </div>
                    {isSavingsInsufficient && (
                        <div className="flex items-center gap-2 px-2 text-[#E53E3E]">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-xs font-bold">存款餘額不足</span>
                        </div>
                    )}
                </div>
            ) : (
                // Income specific options
                <div className="p-4">
                    <div 
                        onClick={() => setFormData({...formData, isAssetLiquidation: !formData.isAssetLiquidation})}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${formData.isAssetLiquidation ? 'bg-[#E6FFFA] border-[#81E6D9]' : 'bg-white border-gray-200'}`}
                    >
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-full ${formData.isAssetLiquidation ? 'bg-[#38B2AC] text-white' : 'bg-gray-100 text-gray-400'}`}>
                                <RefreshCcw className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col">
                                <span className={`text-sm font-bold ${formData.isAssetLiquidation ? 'text-[#2C7A7B]' : 'text-gray-500'}`}>資產變現 / 退款</span>
                                <span className="text-[10px] text-gray-400">存入現金存款，不計入投資額度</span>
                            </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.isAssetLiquidation ? 'bg-[#38B2AC] border-[#38B2AC]' : 'border-gray-300'}`}>
                            {formData.isAssetLiquidation && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                        </div>
                    </div>
                </div>
            )}
        </div>

        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 p-5">
            <input 
                type="text" 
                placeholder="新增備註..." 
                value={formData.note} 
                onChange={e => setFormData({...formData, note: e.target.value})} 
                className="w-full text-base bg-transparent outline-none placeholder-gray-400" 
            />
        </div>

        {formData.type === 'expense' && formData.category !== '投資' && !editingId && !formData.fromSavings && (
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 p-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-black">
                            <CreditCard className="w-5 h-5" />
                        </div>
                        <span className="text-base font-bold text-gray-900">分期付款自動生成</span>
                    </div>
                    <div 
                        onClick={() => setFormData({...formData, isInstallment: !formData.isInstallment})}
                        className={`w-12 h-7 rounded-full p-1 cursor-pointer transition-colors duration-300 ease-in-out ${formData.isInstallment ? 'bg-[#34C759]' : 'bg-gray-200'}`}
                    >
                        <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-300 ease-in-out ${formData.isInstallment ? 'translate-x-5' : 'translate-x-0'}`}></div>
                    </div>
                </div>
                
                {formData.isInstallment && (
                    <div className="mt-5 pt-5 border-t border-gray-50 space-y-4 animate-slide-down">
                        {/* Calculation Type Toggle */}
                        <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                            <button 
                                onClick={() => setFormData({...formData, installmentCalcType: 'total'})}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${formData.installmentCalcType === 'total' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}
                            >
                                輸入總額 (算每期)
                            </button>
                            <button 
                                onClick={() => setFormData({...formData, installmentCalcType: 'monthly'})}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${formData.installmentCalcType === 'monthly' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}
                            >
                                輸入每期 (算總額)
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">期數 (月)</label>
                                <input 
                                    type="text" 
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={formData.installmentCount}
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (val === '' || /^\d+$/.test(val)) {
                                            setFormData({
                                                ...formData, 
                                                installmentCount: val,
                                                // Recalculate amount if in monthly mode
                                                amount: formData.installmentCalcType === 'monthly' && formData.perMonthInput && val ? String(Number(formData.perMonthInput) * Number(val)) : formData.amount
                                            });
                                        }
                                    }}
                                    className="w-full bg-gray-50 rounded-xl p-3 text-center font-bold text-black border border-gray-100 focus:border-black outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">每期金額</label>
                                {formData.installmentCalcType === 'total' ? (
                                    <div className="w-full bg-gray-50 rounded-xl p-3 text-center font-bold text-gray-500 border border-gray-100 flex items-center justify-center gap-1">
                                        <Calculator className="w-3 h-3 opacity-50" />
                                        ${formData.amount && formData.installmentCount ? Math.floor(Number(formData.amount) / Number(formData.installmentCount)).toLocaleString() : 0}
                                    </div>
                                ) : (
                                    <input 
                                        type="text"
                                        placeholder="0"
                                        value={formData.perMonthInput}
                                        readOnly={false} 
                                        inputMode="numeric"
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (/^\d*$/.test(val)) {
                                                setFormData({
                                                    ...formData,
                                                    perMonthInput: val,
                                                    amount: val && formData.installmentCount ? String(Number(val) * Number(formData.installmentCount)) : ''
                                                });
                                            }
                                        }}
                                        className="w-full bg-white rounded-xl p-3 text-center font-bold text-black border-2 border-blue-100 focus:border-blue-500 outline-none cursor-pointer"
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}

        <div className="flex gap-3 pt-4">
            {editingId && (
                <button 
                    onClick={(e) => requestDelete(e as any, editingId)} 
                    className="flex-1 bg-white text-red-500 py-3.5 rounded-xl font-bold border border-gray-200 shadow-sm hover:bg-gray-50 transition flex items-center justify-center gap-2"
                >
                    <Trash2 className="w-5 h-5" /> 刪除
                </button>
            )}
            <button 
                onClick={handleSave} 
                disabled={isSavingsInsufficient} 
                className={`flex-[2] py-3.5 rounded-xl font-bold shadow-lg transition flex items-center justify-center gap-2 ${isSavingsInsufficient ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-900'}`}
            >
                {isSavingsInsufficient ? <Lock className="w-5 h-5" /> : <Save className="w-5 h-5" />} 
                {editingId ? '儲存變更' : '新增紀錄'}
            </button>
        </div>
        </div>
    );
  };

  const renderHistoryView = () => {
    const sorted = transactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const today = new Date().toISOString().split('T')[0];
    const filtered = hideFuture ? sorted.filter(t => t.date <= today) : sorted;

    const groupedTransactions = filtered.reduce((groups: { [key: string]: Transaction[] }, t) => {
        const date = new Date(t.date);
        const key = `${date.getFullYear()}年${date.getMonth() + 1}月`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
        return groups;
      }, {});

    // Swipe handlers
    const handleTouchStart = (e: React.TouchEvent, id: number) => {
        touchStartX.current = e.targetTouches[0].clientX;
    };
    const handleTouchMove = (e: React.TouchEvent, id: number) => {
        if (touchStartX.current === null) return;
        const currentX = e.targetTouches[0].clientX;
        const diff = touchStartX.current - currentX;
        
        if (diff > 50) { 
            setSwipedId(id);
        } else if (diff < -50) { 
            if (swipedId === id) setSwipedId(null);
        }
    };
    const handleTouchEnd = () => {
        touchStartX.current = null;
    };

    return (
      <div className="space-y-6 pb-4 pt-2">
        <div className="flex justify-between items-end px-1">
          <div>
            <h2 className="text-3xl font-extrabold text-black tracking-tight">歷史紀錄</h2>
            <p className="text-xs font-semibold text-gray-400 mt-1">
                {filtered.length} 筆紀錄 {hideFuture && '(已隱藏未到期)'}
            </p>
          </div>
          
          <button 
            onClick={() => setHideFuture(!hideFuture)} 
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition border ${hideFuture ? 'bg-black text-white border-black' : 'bg-white text-gray-500 border-gray-200'}`}
          >
            {hideFuture ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {hideFuture ? '隱藏未到期' : '顯示全部'}
          </button>
        </div>
        
        {Object.entries(groupedTransactions).map(([groupName, groupItems]) => (
          <div key={groupName}>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 ml-1">{groupName}</h4>
            <div className="bg-white rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 divide-y divide-gray-50">
              {(groupItems as Transaction[]).map(t => (
                <div 
                    key={t.id} 
                    className="relative overflow-hidden"
                    onTouchStart={(e) => handleTouchStart(e, t.id)}
                    onTouchMove={(e) => handleTouchMove(e, t.id)}
                    onTouchEnd={handleTouchEnd}
                >
                    <div className="absolute inset-y-0 right-0 w-24 bg-[#FF3B30] flex items-center justify-center z-0" onClick={(e) => requestDelete(e, t.id)}>
                        <Trash2 className="w-6 h-6 text-white" />
                    </div>

                    <div 
                        onClick={() => openEditMode(t)} 
                        className={`p-4 flex justify-between items-center bg-white relative z-10 transition-transform duration-300 ease-out ${swipedId === t.id ? '-translate-x-24' : 'translate-x-0'} active:bg-gray-50`}
                    >
                        <div className="flex items-center gap-4 overflow-hidden">
                            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${t.type === 'income' ? 'bg-green-50 text-[#34C759]' : t.category === '投資' ? 'bg-gray-100 text-black' : 'bg-gray-100 text-gray-500'}`}>
                            {t.category === '投資' ? <TrendingUp className="w-5 h-5" /> : <DollarSign className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="font-bold text-gray-900 text-base truncate">{t.category}</p>
                                {t.groupId && <span className="bg-gray-100 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-md">分期</span>}
                                {t.fromSavings && <span className="bg-[#FEEBC8] text-[#975A16] text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"><PiggyBank className="w-2.5 h-2.5" /> 存款</span>}
                                {t.isAssetLiquidation && <span className="bg-[#E6FFFA] text-[#2C7A7B] text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"><RefreshCcw className="w-2.5 h-2.5" /> 變現</span>}
                            </div>
                            <p className="text-xs text-gray-400 truncate mt-0.5">{t.date} • {t.note || '無備註'}</p>
                            </div>
                        </div>
                        <div className="text-right">
                                <p className={`font-bold text-base ${t.type === 'income' ? 'text-[#34C759]' : 'text-black'}`}>
                                    {t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString()}</p>
                                {t.category !== '投資' && t.type === 'expense' && (
                                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${t.tag === 'need' ? 'bg-gray-100 text-gray-500' : 'bg-[#FFF5F7] text-[#D53F8C]'}`}>
                                        {t.tag === 'need' ? '需要' : '想要'}
                                    </span>
                                )}
                        </div>
                    </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {transactions.length === 0 && <div className="text-center py-20 text-gray-400"><p>尚無交易紀錄</p></div>}
      </div>
    );
  };

  const renderInvestmentView = () => (
    <div className="relative pt-2">
       <div className="p-7 rounded-[28px] text-white shadow-2xl relative overflow-hidden mb-6" style={{ backgroundColor: THEME.darkBg }}>
        <div className="absolute top-[-20%] right-[-20%] w-[80%] h-[80%] bg-white/5 blur-[60px] rounded-full pointer-events-none"></div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-8">
             <div>
                <h1 className="text-3xl font-bold tracking-tight">臨界財富</h1>
                <p className="text-[11px] font-medium text-gray-400 mt-1">累積資產，直達臨界點</p>
             </div>
             <span className="text-xs font-bold bg-white/10 px-3 py-1 rounded-lg text-gray-300 backdrop-blur-md border border-white/5">{selectedMonth}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl backdrop-blur-sm border border-white/5" style={{ backgroundColor: THEME.darkCard }}>
              <div className="flex items-center gap-1.5 mb-2">
                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">當月新增額度</p>
                 <Info className="w-3 h-3 text-gray-500 cursor-help" />
              </div>
              <p className="text-2xl font-bold" style={{ color: THEME.textBlue }}>${stats.investment.monthlyMaxInvestable.toLocaleString()}</p>
              {stats.investment.divertedToEmergency > 0 && (
                  <p className="text-[9px] text-[#F6AD55] mt-1 opacity-80">
                    (月餘額扣除 ${stats.investment.divertedToEmergency.toLocaleString()} 至預備金)
                  </p>
              )}
            </div>
            <div className="p-4 rounded-2xl backdrop-blur-sm border border-white/5" style={{ backgroundColor: THEME.darkCard }}>
               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">實際投入金額</p>
               <p className="text-2xl font-bold" style={{ color: THEME.textGreen }}>${stats.investment.actualInvested.toLocaleString()}</p>
            </div>
          </div>

          <div className="mt-4">
             <div className={`p-5 rounded-2xl backdrop-blur-md border ${stats.investment.monthlyRemainingInvestable < 0 ? 'border-red-500/30 bg-red-500/10' : 'border-white/5'}`} style={{ backgroundColor: stats.investment.monthlyRemainingInvestable < 0 ? undefined : THEME.darkCard }}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-300">本月加碼資金</span>
                  <span className={`text-2xl font-bold ${stats.investment.monthlyRemainingInvestable < 0 ? 'text-red-400' : ''}`} style={{ color: stats.investment.monthlyRemainingInvestable >= 0 ? THEME.textYellow : undefined }}>
                     ${stats.investment.monthlyRemainingInvestable.toLocaleString()}
                  </span>
                </div>
                <p className="text-[9px] text-gray-500 text-right mt-1">公式：新增額度 - 本月實際投入</p>
             </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-white/10 flex flex-col gap-2">
             <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gray-400">歷史累積可加碼資金</span>
                <span className="text-xl font-bold text-gray-200">${stats.investment.cumulativeAddOnAvailable.toLocaleString()}</span>
             </div>
             {stats.investment.capitalDivertedToEmergency > 0 && (
                <div className="flex justify-between items-center bg-orange-500/10 px-2 py-1 rounded">
                    <span className="text-[10px] text-orange-400">已優先轉移至緊急預備金</span>
                    <span className="text-xs font-bold text-orange-400">-${stats.investment.capitalDivertedToEmergency.toLocaleString()}</span>
                </div>
             )}
             {stats.investment.accumulatedDeficit > 0 && (
                 <div className="flex justify-between items-center">
                    <span className="text-xs text-red-400">赤字</span>
                    <span className="text-sm font-bold text-red-400">-${stats.investment.accumulatedDeficit.toLocaleString()}</span>
                 </div>
             )}
          </div>
        </div>
      </div>
       
      <div className="p-5 rounded-2xl shadow-sm border border-[#FEEBC8]" style={{ backgroundColor: THEME.creamBg }}>
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-[#975A16]">
                <LinkIcon className="w-4 h-4" />
                <p className="text-xs font-bold uppercase tracking-wider">現金累積存款 (10% 儲蓄)</p>
            </div>
            {stats.investment.savingsExpense > 0 && (
                <span className="text-[10px] font-bold text-[#C05621] bg-[#FEEBC8] px-2 py-0.5 rounded-full border border-[#FBD38D]">
                    本月支出 -${stats.investment.savingsExpense.toLocaleString()}
                </span>
            )}
        </div>
        <div className="flex items-center justify-between bg-white/60 p-3 rounded-xl">
            <span className="text-sm font-semibold text-gray-600">目前累積</span>
            <span className="text-2xl font-bold" style={{ color: THEME.textBrown }}>${stats.investment.savings.toLocaleString()}</span>
        </div>
        {stats.investment.assetLiquidation > 0 && (
            <div className="mt-2 text-right">
                <span className="text-[10px] text-[#2C7A7B] bg-[#E6FFFA] px-2 py-0.5 rounded-full border border-[#81E6D9]">
                    +${stats.investment.assetLiquidation.toLocaleString()} 資產變現入帳
                </span>
            </div>
        )}
      </div>
    </div>
  );

  const renderSettingsView = () => {
    const handleStatChange = (field: keyof StatsData, value: string) => {
        if (/^\d*$/.test(value)) {
            setInitialStats(prev => ({...prev, [field]: value === '' ? 0 : Number(value)}));
        }
    };

    return (
        <div className="space-y-6 pt-2">
        <div className="flex items-end justify-between px-1 mb-2">
            <h2 className="text-3xl font-extrabold text-black tracking-tight">設定</h2>
        </div>
        
        <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 ml-2">緊急預備金</h4>
            <CardContainer className="divide-y divide-gray-50">
            <div className="p-4 flex items-center justify-between">
                <label className="text-base font-medium text-black">初始金額</label>
                <input 
                    type="text" 
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0" 
                    className="text-base font-medium text-right outline-none text-black w-32" 
                    value={initialStats.emergencyCurrent || ''} 
                    onChange={e => handleStatChange('emergencyCurrent', e.target.value)} 
                />
            </div>
            <div className="p-4 flex items-center justify-between">
                <label className="text-base font-medium text-black">目標金額</label>
                <input 
                    type="text" 
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0" 
                    className="text-base font-medium text-right outline-none text-black w-32" 
                    value={initialStats.emergencyGoal || ''} 
                    onChange={e => handleStatChange('emergencyGoal', e.target.value)} 
                />
            </div>
            </CardContainer>
            <p className="text-xs text-gray-400 mt-2 ml-2">建議設定為 3~6 個月的生活開銷</p>
        </div>

        <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 ml-2">初始資產配置</h4>
            <CardContainer className="divide-y divide-gray-50">
            <div className="p-4 flex items-center justify-between">
                <label className="text-base font-medium text-gray-900">累積可加碼資金</label>
                <input 
                    type="text" 
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    className="text-base font-medium text-right outline-none text-black w-32" 
                    value={initialStats.available || ''} 
                    onChange={e => handleStatChange('available', e.target.value)} 
                />
            </div>
            <div className="p-4 flex items-center justify-between">
                <label className="text-base font-medium text-gray-900">初始當月新增額度</label>
                <input 
                    type="text" 
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    className="text-base font-medium text-right outline-none text-black w-32" 
                    value={initialStats.initialInvestable || ''} 
                    onChange={e => handleStatChange('initialInvestable', e.target.value)} 
                />
            </div>
            <div className="p-4 flex items-center justify-between">
                <label className="text-base font-medium text-gray-900">現金累積存款</label>
                <input 
                    type="text" 
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    className="text-base font-medium text-right outline-none text-black w-32" 
                    value={initialStats.savings || ''} 
                    onChange={e => handleStatChange('savings', e.target.value)} 
                />
            </div>
            </CardContainer>
        </div>

        <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 ml-2">每月預算設定</h4>
            <CardContainer className="divide-y divide-gray-50">
                {CATEGORIES.filter(c => c !== '收入' && c !== '投資').map(cat => (
                <div key={cat} className="p-4 flex items-center justify-between">
                    <label className="text-base font-medium text-gray-900 w-24">{cat}</label>
                    <input 
                        type="text" 
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="未設定" 
                        className="text-base font-medium text-right outline-none text-black flex-1" 
                        value={budgets[cat] || ''} 
                        onChange={(e) => {
                            if (/^\d*$/.test(e.target.value)) {
                                updateBudget(cat, e.target.value);
                            }
                        }} 
                    />
                </div>
                ))}
            </CardContainer>
        </div>

        <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 ml-2">資料管理</h4>
            <div 
                onClick={handleExport}
                className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center justify-center gap-2 cursor-pointer active:bg-gray-50 transition-colors"
            >
                <Download className="w-5 h-5 text-black" />
                <span className="text-base font-bold text-black">匯出交易紀錄 (Excel/CSV)</span>
            </div>
        </div>
        
        <div className="py-4 text-center">
            <p className="text-xs font-medium text-gray-300">臨界財富 v6.7</p>
        </div>
        </div>
    );
  };

  const needsScrolling = activeTab === 'dashboard' || activeTab === 'history' || activeTab === 'form' || activeTab === 'settings' || activeTab === 'investment';
  
  const scrollContainerClasses = `
    flex-1 relative p-5 pt-[calc(env(safe-area-inset-top)+20px)]
    ${needsScrolling 
        ? 'overflow-y-auto hide-scrollbar pb-24'
        : 'overflow-hidden'
    }
  `;

  return (
    <>
      <style>{`
        body {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: #F8F9FA; 
        }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animation-slide-up { animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>

      {/* Main Container */}
      <div className="fixed inset-0 w-full h-[100dvh] bg-[#F8F9FA] flex justify-center items-center overflow-hidden">
        {/* App Frame */}
        <div className="w-full max-w-md h-full bg-[#F8F9FA] flex flex-col relative shadow-2xl overflow-hidden select-none touch-manipulation overscroll-none" ref={scrollRef}>
           
           {/* Delete Modal */}
           {deleteModal.show && (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-black/20 backdrop-blur-sm animation-fade-in">
               <div className="bg-white/90 backdrop-blur-xl rounded-[14px] shadow-2xl w-full max-w-[270px] text-center overflow-hidden transform scale-100 transition-all">
                  <div className="p-5">
                      <h3 className="text-[17px] font-bold text-black mb-1">刪除紀錄？</h3>
                      <p className="text-[13px] text-gray-500">此動作無法復原。</p>
                  </div>
                  <div className="flex border-t border-gray-300/50">
                     <button onClick={() => setDeleteModal({ show: false, id: null })} className="flex-1 py-3 text-[17px] text-black font-normal border-r border-gray-300/50 active:bg-gray-100">取消</button>
                     <button onClick={confirmDelete} className="flex-1 py-3 text-[17px] text-[#FF3B30] font-bold active:bg-gray-100">刪除</button>
                  </div>
               </div>
            </div>
           )}

           {/* Calculator Overlay - Fixed 400px height (Increased by ~15%) */}
           {isCalculatorOpen && (
              <>
                {/* Backdrop for clicking outside */}
                <div 
                    className="absolute inset-0 z-40 bg-transparent"
                    onClick={() => setIsCalculatorOpen(false)}
                ></div>

                <div className="absolute inset-x-0 bottom-0 z-50 bg-black shadow-2xl animation-slide-up flex flex-col pb-[calc(env(safe-area-inset-bottom)+30px)] pt-5 px-3 h-[400px] rounded-t-[24px]">
                    
                    {/* Keypad Grid - Compact Flat */}
                    <div className="grid grid-cols-4 gap-2 h-full">
                        {/* Row 1 */}
                        <button onClick={() => handleCalcInput('AC')} className="h-full rounded-xl bg-white text-black text-xl font-bold active:bg-gray-200 flex items-center justify-center transition-colors">AC</button>
                        <button onClick={() => handleCalcInput('DEL')} className="h-full rounded-xl bg-white text-black text-xl font-bold active:bg-gray-200 flex items-center justify-center transition-colors"><Delete className="w-6 h-6" /></button>
                        <button onClick={() => handleCalcInput('%')} className="h-full rounded-xl bg-white text-black text-xl font-bold active:bg-gray-200 flex items-center justify-center transition-colors">%</button>
                        <button onClick={() => handleCalcInput('/')} className="h-full rounded-xl bg-black border border-white/20 text-white text-2xl font-bold pb-0.5 active:bg-gray-800 flex items-center justify-center transition-colors">÷</button>

                        {/* Row 2 */}
                        <button onClick={() => handleCalcInput('7')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">7</button>
                        <button onClick={() => handleCalcInput('8')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">8</button>
                        <button onClick={() => handleCalcInput('9')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">9</button>
                        <button onClick={() => handleCalcInput('*')} className="h-full rounded-xl bg-black border border-white/20 text-white text-2xl font-bold pt-0.5 active:bg-gray-800 flex items-center justify-center transition-colors">×</button>

                        {/* Row 3 */}
                        <button onClick={() => handleCalcInput('4')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">4</button>
                        <button onClick={() => handleCalcInput('5')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">5</button>
                        <button onClick={() => handleCalcInput('6')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">6</button>
                        <button onClick={() => handleCalcInput('-')} className="h-full rounded-xl bg-black border border-white/20 text-white text-3xl font-bold pb-0.5 active:bg-gray-800 flex items-center justify-center transition-colors">-</button>

                        {/* Row 4 */}
                        <button onClick={() => handleCalcInput('1')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">1</button>
                        <button onClick={() => handleCalcInput('2')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">2</button>
                        <button onClick={() => handleCalcInput('3')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">3</button>
                        <button onClick={() => handleCalcInput('+')} className="h-full rounded-xl bg-black border border-white/20 text-white text-2xl font-bold pb-0.5 active:bg-gray-800 flex items-center justify-center transition-colors">+</button>
                        
                        {/* Row 5 */}
                        <button onClick={() => handleCalcInput('0')} className="col-span-2 h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center pl-6 transition-colors">0</button>
                        <button onClick={() => handleCalcInput('.')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">.</button>
                        <button onClick={() => handleCalcInput('=')} className="h-full rounded-xl bg-black border border-white/20 text-white text-2xl font-bold active:bg-gray-800 flex items-center justify-center transition-colors">=</button>
                    </div>
                </div>
              </>
           )}

          {/* Content Area */}
          <div className={scrollContainerClasses}>
            {activeTab === 'dashboard' && renderDashboardView()}
            {activeTab === 'history' && renderHistoryView()}
            {activeTab === 'form' && renderFormView()}
            {activeTab === 'investment' && renderInvestmentView()}
            {activeTab === 'settings' && renderSettingsView()}
          </div>

          {/* Tab Bar */}
          <div className="flex-none bg-white/95 backdrop-blur-xl border-t border-gray-200 pb-[calc(env(safe-area-inset-bottom)+5px)] pt-2 px-2 flex justify-around items-center z-30">
            <button 
              onClick={() => setActiveTab('dashboard')} 
              className={`flex flex-col items-center justify-center w-20 h-14 rounded-2xl transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-gray-100 text-black' : 'text-gray-400 hover:bg-gray-50'}`}
            >
                <PieChart className="w-6 h-6 mb-0.5" strokeWidth={2.5} />
                <span className="text-[10px] font-bold">總覽</span>
            </button>
            <button 
              onClick={() => setActiveTab('history')} 
              className={`flex flex-col items-center justify-center w-20 h-14 rounded-2xl transition-all duration-200 ${activeTab === 'history' ? 'bg-gray-100 text-black' : 'text-gray-400 hover:bg-gray-50'}`}
            >
                <List className="w-6 h-6 mb-0.5" strokeWidth={2.5} />
                <span className="text-[10px] font-bold">明細</span>
            </button>
            
            <div className="relative -top-6">
                <button 
                    onClick={handleFabClick} 
                    className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-105 transition-transform ${activeTab === 'form' && !editingId ? 'bg-gray-900 rotate-45' : 'bg-black'}`}
                >
                    <Plus className="w-7 h-7" strokeWidth={3} />
                </button>
            </div>

            <button 
              onClick={() => setActiveTab('investment')} 
              className={`flex flex-col items-center justify-center w-20 h-14 rounded-2xl transition-all duration-200 ${activeTab === 'investment' ? 'bg-gray-100 text-black' : 'text-gray-400 hover:bg-gray-50'}`}
            >
                <TrendingUp className="w-6 h-6 mb-0.5" strokeWidth={2.5} />
                <span className="text-[10px] font-bold">投資</span>
            </button>
            <button 
              onClick={() => setActiveTab('settings')} 
              className={`flex flex-col items-center justify-center w-20 h-14 rounded-2xl transition-all duration-200 ${activeTab === 'settings' ? 'bg-gray-100 text-black' : 'text-gray-400 hover:bg-gray-50'}`}
            >
                <Settings className="w-6 h-6 mb-0.5" strokeWidth={2.5} />
                <span className="text-[10px] font-bold">設定</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}