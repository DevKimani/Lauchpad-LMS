import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Catalog from './pages/Catalog'
import CourseDetail from './pages/CourseDetail'
import MyCourses from './pages/MyCourses'
import CourseEditor from './pages/CourseEditor'
import MyLearning from './pages/MyLearning'
import Roster from './pages/Roster'
import QuizBuilder from './pages/QuizBuilder'
import TakeQuiz from './pages/TakeQuiz'
import GradingQueue from './pages/GradingQueue'
import Gradebook from './pages/Gradebook'
import FeedbackInbox from './pages/FeedbackInbox'
import CertificationQueue from './pages/CertificationQueue'
import LessonPlayer from './pages/LessonPlayer'
import Progress from './pages/Progress'
import Achievements from './pages/Achievements'
import Certificate from './pages/Certificate'
import AdminOverview from './pages/admin/Overview'
import AdminUsers from './pages/admin/Users'
import AdminCourses from './pages/admin/Courses'
import AdminReports from './pages/admin/Reports'
import SurveyReport from './pages/admin/SurveyReport'
import SubmissionsReport from './pages/admin/SubmissionsReport'
import ProgressReport from './pages/admin/ProgressReport'
import Jobs from './pages/Jobs'
import ManageJobs from './pages/admin/ManageJobs'
import JobsReport from './pages/admin/JobsReport'
import Profile from './pages/Profile'
import SetPassword from './pages/SetPassword'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs"
        element={
          <ProtectedRoute>
            <Jobs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/courses"
        element={
          <ProtectedRoute>
            <Catalog />
          </ProtectedRoute>
        }
      />
      <Route
        path="/courses/:courseId/lessons/:lessonId"
        element={
          <ProtectedRoute>
            <LessonPlayer />
          </ProtectedRoute>
        }
      />
      <Route
        path="/courses/:id"
        element={
          <ProtectedRoute>
            <CourseDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/progress"
        element={
          <ProtectedRoute>
            <Progress />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-learning"
        element={
          <ProtectedRoute>
            <MyLearning />
          </ProtectedRoute>
        }
      />
      <Route
        path="/instructor/courses"
        element={
          <ProtectedRoute roles={['instructor', 'admin']}>
            <MyCourses />
          </ProtectedRoute>
        }
      />
      <Route
        path="/quizzes/:id"
        element={
          <ProtectedRoute>
            <TakeQuiz />
          </ProtectedRoute>
        }
      />
      <Route
        path="/instructor/quizzes/:id"
        element={
          <ProtectedRoute roles={['instructor', 'admin']}>
            <QuizBuilder />
          </ProtectedRoute>
        }
      />
      <Route
        path="/instructor/courses/:id/roster"
        element={
          <ProtectedRoute roles={['instructor', 'admin']}>
            <Roster />
          </ProtectedRoute>
        }
      />
      <Route
        path="/instructor/courses/:id/gradebook"
        element={
          <ProtectedRoute roles={['instructor', 'admin']}>
            <Gradebook />
          </ProtectedRoute>
        }
      />
      <Route
        path="/instructor/courses/:id"
        element={
          <ProtectedRoute roles={['instructor', 'admin']}>
            <CourseEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/instructor/grading"
        element={
          <ProtectedRoute roles={['instructor', 'admin']}>
            <GradingQueue />
          </ProtectedRoute>
        }
      />
      <Route
        path="/instructor/feedback"
        element={
          <ProtectedRoute roles={['instructor', 'admin']}>
            <FeedbackInbox />
          </ProtectedRoute>
        }
      />
      <Route
        path="/instructor/certifications"
        element={
          <ProtectedRoute roles={['instructor', 'admin']}>
            <CertificationQueue />
          </ProtectedRoute>
        }
      />
      <Route
        path="/achievements"
        element={
          <ProtectedRoute>
            <Achievements />
          </ProtectedRoute>
        }
      />
      <Route
        path="/certificate/:id"
        element={
          <ProtectedRoute>
            <Certificate />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['admin']}>
            <AdminOverview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute roles={['admin']}>
            <AdminUsers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/courses"
        element={
          <ProtectedRoute roles={['admin']}>
            <AdminCourses />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <ProtectedRoute roles={['admin', 'instructor']}>
            <AdminReports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports/surveys"
        element={
          <ProtectedRoute roles={['admin', 'instructor']}>
            <SurveyReport />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports/submissions"
        element={
          <ProtectedRoute roles={['admin', 'instructor']}>
            <SubmissionsReport />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports/progress"
        element={
          <ProtectedRoute roles={['admin', 'instructor']}>
            <ProgressReport />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/jobs"
        element={
          <ProtectedRoute roles={['admin', 'instructor']}>
            <ManageJobs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports/jobs"
        element={
          <ProtectedRoute roles={['admin', 'instructor']}>
            <JobsReport />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
