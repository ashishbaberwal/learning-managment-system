import { EmptyState } from "@/components/general/EmptyState";
import { Badge } from "@/components/ui/badge";
import { getRecommendedCourses } from "@/lib/recommendations";
import { getAllCourses } from "../data/course/get-all-courses";
import { getEnrolledCourses } from "../data/user/get-enrolled-courses";
import { requireUser } from "../data/user/require-user";
import { PublicCourseCard } from "../(public)/_components/PublicCourseCard";
import { CourseProgressCard } from "./_components/CourseProgressCard";




export default async function DashboardPage() {
    const user = await requireUser();
    const [courses, enrolledCourses, recommendations] = await Promise.all([
        getAllCourses(),
        getEnrolledCourses(),
        getRecommendedCourses(user.id),
    ]);
    return (
        <>
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold">Enrolled Courses</h1>
                <p>Here you can see all the courses , you have access to</p>
            </div>

            {enrolledCourses.length === 0 ? (
                <EmptyState
                    title="No courses purchased"
                    description="You haven't purchased any courses yet."
                    buttonText="Browse  Course"
                    href="/course"
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {enrolledCourses.map((course) => (
                        <CourseProgressCard
                            key={course.Course.id}
                            data={course}
                        />
                    ))}
                </div>
            )}

            {recommendations.length > 0 && (
                <section className="mt-10">
                    <div className="flex flex-col gap-2 mb-5">
                        <h1 className="text-3xl font-bold">Recommended for you</h1>
                        <p>
                            Based on what students in your courses also enrolled
                            in
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {recommendations.map((recommendation) => (
                            <div
                                key={recommendation.courseId}
                                className="flex flex-col gap-3"
                            >
                                <PublicCourseCard data={recommendation.course} />
                                <Badge
                                    variant="secondary"
                                    className="self-start"
                                >
                                    {recommendation.reason}
                                </Badge>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className="mt-10">
                <div className="flex flex-col gap-2 mb-5">
                    <h1 className="text-3xl font-bold">Avilable Courses</h1>
                    <p>Here you can see all the courses you can purchase</p>
                </div>

                {courses.filter(
                    (course) =>
                        !enrolledCourses.some(
                            ({ Course: enrolled }) => enrolled.id === course.id
                        )
                ).length === 0 ? (
                    <EmptyState
                        title="No courses Available"
                        description="You have already purchased avilable courses"
                        buttonText="Browse Course"
                        href="/courses"
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {courses
                            .filter(
                                (course) =>
                                    !enrolledCourses.some(
                                        ({ Course: enrolled }) =>
                                            enrolled.id === course.id
                                    )
                            )
                            .map((course) => (
                                <PublicCourseCard
                                    key={course.id}
                                    data={course}
                                />
                            ))}
                    </div>
                )}
            </section>
        </>
    );
}
