import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

/* -------------------------------------------------------
   Check whether the currently logged-in Firebase user
   is actually an admin.
------------------------------------------------------- */
async function verifyAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }

  const token = authorization.substring(7);

  const decodedToken = await adminAuth.verifyIdToken(token);

  const adminDoc = await adminDb
    .collection("users")
    .doc(decodedToken.uid)
    .get();

  if (!adminDoc.exists) {
    throw new Error("Admin profile not found");
  }

  const adminData = adminDoc.data();

  if (adminData?.role !== "admin") {
    throw new Error("Admin access required");
  }

  return decodedToken;
}

/* -------------------------------------------------------
   GET
   Get all users.
------------------------------------------------------- */
export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request);

    const usersSnapshot = await adminDb.collection("users").get();

    const users = await Promise.all(
      usersSnapshot.docs.map(async (doc) => {
        const data = doc.data();

        let authUser = null;

        try {
          authUser = await adminAuth.getUser(doc.id);
        } catch {
          // Firestore profile exists but Firebase Auth account
          // does not exist.
        }

        return {
          id: doc.id,
          name: data.name || "",
          email: authUser?.email || data.email || "",
          phone: authUser?.phoneNumber || data.phone || "",
          role: data.role || "donor",
          bloodType: data.bloodType || "",
          totalDonations: data.totalDonations || 0,
          isAvailable: data.isAvailable ?? false,
          disabled: authUser?.disabled ?? false,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error: any) {
    console.error("GET /api/admin/users error:", error);

    const status =
      error?.message === "Admin access required" ||
      error?.message === "Unauthorized"
        ? 403
        : 500;

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Failed to fetch users",
      },
      { status }
    );
  }
}

/* -------------------------------------------------------
   POST
   Create a new Firebase Auth user + Firestore profile.
------------------------------------------------------- */
export async function POST(request: NextRequest) {
  try {
    await verifyAdmin(request);

    const body = await request.json();

    const {
      name,
      email,
      password,
      phone,
      role,
      bloodType,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, message: "Name is required" },
        { status: 400 }
      );
    }

    if (!email?.trim()) {
      return NextResponse.json(
        { success: false, message: "Email is required" },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        {
          success: false,
          message: "Password must contain at least 6 characters",
        },
        { status: 400 }
      );
    }

    if (!["donor", "recipient", "admin"].includes(role)) {
      return NextResponse.json(
        { success: false, message: "Invalid role" },
        { status: 400 }
      );
    }

    /* Create Firebase Authentication account */
    const authUser = await adminAuth.createUser({
      email: email.trim(),
      password,
      displayName: name.trim(),
      ...(phone?.trim()
        ? {
            phoneNumber: phone.trim(),
          }
        : {}),
    });

    try {
      /* Create Firestore user profile */
      await adminDb.collection("users").doc(authUser.uid).set({
        name: name.trim(),
        email: email.trim(),
        phone: phone?.trim() || "",
        role,
        bloodType: bloodType || "",
        totalDonations: role === "donor" ? 0 : 0,
        isAvailable: role === "donor",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (firestoreError) {
      /* Roll back Auth account if Firestore creation fails */
      await adminAuth.deleteUser(authUser.uid);

      throw firestoreError;
    }

    return NextResponse.json({
      success: true,
      message: "User created successfully",
      user: {
        id: authUser.uid,
        email: authUser.email,
      },
    });
  } catch (error: any) {
    console.error("POST /api/admin/users error:", error);

    let message = "Failed to create user";

    if (error?.code === "auth/email-already-exists") {
      message = "A user with this email already exists";
    } else if (error?.code === "auth/invalid-email") {
      message = "Invalid email address";
    } else if (error?.code === "auth/invalid-password") {
      message = "Invalid password";
    } else if (error?.message) {
      message = error.message;
    }

    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status: 500 }
    );
  }
}

/* -------------------------------------------------------
   PATCH
   Edit an existing user.
------------------------------------------------------- */
export async function PATCH(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);

    const body = await request.json();

    const {
      uid,
      name,
      email,
      password,
      phone,
      role,
      bloodType,
      isAvailable,
      disabled,
    } = body;

    if (!uid) {
      return NextResponse.json(
        {
          success: false,
          message: "User ID is required",
        },
        { status: 400 }
      );
    }

    /* Prevent changing your own admin account into another role */
    if (uid === adminUser.uid && role && role !== "admin") {
      return NextResponse.json(
        {
          success: false,
          message: "You cannot remove the admin role from your own account.",
        },
        { status: 400 }
      );
    }

    const authUpdates: any = {};

    if (email !== undefined) {
      authUpdates.email = email.trim();
    }

    if (name !== undefined) {
      authUpdates.displayName = name.trim();
    }

    if (phone !== undefined) {
      authUpdates.phoneNumber = phone.trim() || undefined;
    }

    if (password) {
      if (password.length < 6) {
        return NextResponse.json(
          {
            success: false,
            message: "Password must contain at least 6 characters",
          },
          { status: 400 }
        );
      }

      authUpdates.password = password;
    }

    if (disabled !== undefined) {
      authUpdates.disabled = Boolean(disabled);
    }

    /* Update Firebase Auth */
    if (Object.keys(authUpdates).length > 0) {
      await adminAuth.updateUser(uid, authUpdates);
    }

    /* Update Firestore profile */
    const firestoreUpdates: any = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (name !== undefined) {
      firestoreUpdates.name = name.trim();
    }

    if (email !== undefined) {
      firestoreUpdates.email = email.trim();
    }

    if (phone !== undefined) {
      firestoreUpdates.phone = phone.trim();
    }

    if (role !== undefined) {
      if (!["donor", "recipient", "admin"].includes(role)) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid role",
          },
          { status: 400 }
        );
      }

      firestoreUpdates.role = role;
    }

    if (bloodType !== undefined) {
      firestoreUpdates.bloodType = bloodType;
    }

    if (isAvailable !== undefined) {
      firestoreUpdates.isAvailable = Boolean(isAvailable);
    }

    await adminDb
      .collection("users")
      .doc(uid)
      .set(firestoreUpdates, { merge: true });

    return NextResponse.json({
      success: true,
      message: "User updated successfully",
    });
  } catch (error: any) {
    console.error("PATCH /api/admin/users error:", error);

    let message = "Failed to update user";

    if (error?.code === "auth/user-not-found") {
      message = "User does not exist";
    } else if (error?.code === "auth/email-already-exists") {
      message = "That email is already being used";
    } else if (error?.code === "auth/invalid-email") {
      message = "Invalid email address";
    } else if (error?.message) {
      message = error.message;
    }

    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status: 500 }
    );
  }
}

/* -------------------------------------------------------
   DELETE
   Delete Firebase Auth account + Firestore profile.
------------------------------------------------------- */
export async function DELETE(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);

    const body = await request.json();

    const uid = body.uid;

    if (!uid) {
      return NextResponse.json(
        {
          success: false,
          message: "User ID is required",
        },
        { status: 400 }
      );
    }

    /* Never allow admin to delete themselves */
    if (uid === adminUser.uid) {
      return NextResponse.json(
        {
          success: false,
          message: "You cannot delete your own admin account.",
        },
        { status: 400 }
      );
    }

    /* Delete Firebase Auth account */
    try {
      await adminAuth.deleteUser(uid);
    } catch (error: any) {
      if (error?.code !== "auth/user-not-found") {
        throw error;
      }
    }

    /* Delete Firestore profile */
    await adminDb.collection("users").doc(uid).delete();

    return NextResponse.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error: any) {
    console.error("DELETE /api/admin/users error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Failed to delete user",
      },
      { status: 500 }
    );
  }
}