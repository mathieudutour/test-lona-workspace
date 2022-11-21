const fs = require("fs");
const path = require("path");

const newMatch = /### Extension\s*https:\/\/raycast\.com\/([^\/]+)\/([^\/\s]+)/;

// TODO: - check labels to see if we are dealing with an extension issue
// - if there are no labels -> error
// - check the title if it's filled up

module.exports = async ({ github, context, core }) => {
  const codeowners = await getCodeOwners({ github, context });

  const [, owner, ext] = newMatch.exec(context.payload.issue.body) || [];

  if (!ext) {
    await comment({
      github,
      context,
      comment: `We could not find the extension related to this issue. Please fill update the issue with the link to the extension.`,
    });
    await github.rest.issues.addLabels({
      issue_number: context.payload.issue.number,
      owner: context.repo.owner,
      repo: context.repo.repo,
      labels: ["status: stalled"],
    });
    return;
  }

  const sender = context.payload.sender.login;

  if (sender === "raycastbot") {
    console.log(
      "We don't notify people when raycastbot is doing its stuff (usually merging the PR)"
    );
    return;
  }

  const owners = codeowners[ext];

  if (!owners) {
    // it's a new extension
    console.log(`cannot find existing extension ${ext}`);
    return;
  }

  await github.rest.issues.addLabels({
    issue_number: context.payload.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    labels: [`extension: ${ext}`],
  });

  await comment({
    github,
    context,
    comment: `Thank you for opening this issue!\n\n🔔 ${owners
      .filter((x) => x !== sender)
      .map((x) => `@${x}`)
      .join(" ")} you might want to have a look.`,
  });
};

async function getCodeOwners({ github, context }) {
  const { data } = await github.rest.repos.getContent({
    mediaType: {
      format: "raw",
    },
    owner: context.repo.owner,
    repo: context.repo.repo,
    path: ".github/CODEOWNERS",
  });

  const codeowners = Buffer.from(data.content, "base64").toString("utf8");

  const regex = /(\/extensions\/[\w-]+) +(.+)/g;
  const matches = codeowners.matchAll(regex);

  return Array.from(matches).reduce((prev, match) => {
    prev[match[1]] = match[2].split(" ").map((x) => x.replace(/^@/, ""));
    return prev;
  }, {});
}

// Create a new comment or update the existing one
async function comment({ github, context, comment }) {
  // Get the existing comments on the PR
  const { data: comments } = await github.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
  });

  // Find any comment already made by the bot
  const botComment = comments.find(
    (comment) => comment.user.login === "raycastbot"
  );

  if (botComment) {
    await github.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: botComment.id,
      body: comment,
    });
  } else {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number,
      body: comment,
    });
  }
}
