import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './components/layout/DashboardLayout'; 
import OverviewModule from './modules/overview/OverviewModule';
import DiagnosticsModule from './modules/diagnostics/DiagnosticsModule';
import ReliabilityModule from './modules/reliability/ReliabilityModule';  
//import SupplyChainModule from './modules/supply-chain/SupplyChainModule';
import FinancialWarrantyModule from './modules/financial-warranty/FinancialWarrantyModule'; 
import TelematicsDataModule from './modules/telematics/TelematicsModule';
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<OverviewModule />} />
          
          <Route path="/vehicle-diagnostics" element={<DiagnosticsModule />} />
          
          <Route path="/component-reliability" element={
            <ReliabilityModule />
          } />
          
          <Route path="/financial-warranty" element={
            <FinancialWarrantyModule />
          } />
          <Route path="/telematics-data" element={
            <TelematicsDataModule />
          } />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}