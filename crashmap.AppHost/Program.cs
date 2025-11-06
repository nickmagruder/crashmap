var builder = DistributedApplication.CreateBuilder(args);

var server = builder.AddProject<Projects.crashmap_Server>("crashmap-server");

builder.AddNpmApp("crashmap-client", "../crashmap.client", "dev")
    .WithReference(server)
    .WithHttpEndpoint(env: "SERVER_URL")
    .WithExternalHttpEndpoints()
    .PublishAsDockerFile();

builder.Build().Run();
